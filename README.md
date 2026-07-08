# Datadog Creator

Conjunto de ferramentas internas de Engenharia de Vendas para **Datadog**
(Next.js 16 + React 19, JavaScript). Autenticação real por usuário, suporte a
**múltiplas orgs Datadog por usuário** (chaves cifradas e guardadas no
Supabase), e coleta feita no servidor.

## Ferramentas

- **MonitorsCreator** — descobre serviços e cria monitores de *anomaly detection*, com parâmetros por tipo de alerta (algoritmo, sazonalidade, alert window, direção).
- **MonitorsAnalytics** — score 0–100 ponderado da maturidade dos monitores (Falsos Positivos com maior peso).
- **ScopeMaturity** — score de governança/cobertura do ambiente (tags, SLO/error budget, logs, etc.).
- **FinOps Insights** — consumo por licenciamento, alarme de anomalia de consumo e custo estimado.

## Setup rápido

```bash
# 1. Instalar dependências
npm install

# 2. Criar o .env.local a partir do exemplo (o .env.local é ignorado pelo git)
cp .env.example .env.local

# 3. Gerar credenciais (AUTH_SECRET + usuário com hash bcrypt)
npm run gen:credentials -- "MinhaSenhaForte123" meu.usuario "Meu Nome"
#    Copie as linhas AUTH_SECRET e AUTH_USERS impressas para o .env.local.

# 4. Rodar
npm run dev      # http://localhost:9999
```

> O login é por **usuário** (campo "Usuário"), não e-mail.

### ⚠️ Regra do `$` no hash bcrypt

O hash bcrypt contém `$`. O Next.js lê o `.env` com *dotenv-expand*, que trata `$`
como variável e corromperia o hash. Por isso:

- **Local (`.env.local`):** escape cada `$` como `\$` → `\$2b\$12\$...`
- **Vercel (painel de Env Vars):** use o `$` **cru** → `$2b$12$...`

O `npm run gen:credentials` já imprime as duas formas prontas (local escapada e Vercel crua).

## Variáveis de ambiente (`.env.local`)

| Variável | O que é |
|---|---|
| `AUTH_SECRET` | Segredo que assina a sessão (JWT). Igual em local e Vercel. |
| `AUTH_USERS` | Lista JSON de usuários: `[{"username","name","passwordHash"}]`. Prioritária. |

Alternativa a `AUTH_USERS` para **usuário único** (fallback):

| Variável | O que é |
|---|---|
| `AUTH_LOGIN_USER` | Nome de usuário de login. |
| `AUTH_LOGIN_NAME` | (opcional) Nome exibido. |
| `AUTH_LOGIN_PASSWORD_HASH` | Hash bcrypt da senha (nunca a senha pura). |

As chaves do Datadog (API Key, App Key, site) **não** vão no `.env` — cada
usuário conecta quantas orgs quiser pela interface (Configurações ou Step 1 do
wizard). Elas ficam **cifradas** (AES-256-GCM) numa tabela no **Supabase**;
veja a seção "Múltiplas orgs (Supabase)" abaixo para o setup.

## Múltiplas orgs (Supabase)

Cada usuário pode salvar N conexões Datadog (org/site diferentes) e alternar
entre elas sem digitar as chaves de novo — só uma fica "ativa" por vez, e é
essa que as ferramentas usam.

1. Crie um projeto em https://supabase.com (grátis).
2. No **SQL Editor** do projeto, rode o conteúdo de `scripts/supabase-schema.sql`
   (cria a tabela `datadog_connections`).
3. Em **Project Settings → API**, copie a **Project URL** e a chave
   **service_role** (não a `anon` — a `service_role` é a única usada, e só no
   servidor; nunca é exposta ao browser).
4. Gere uma chave de criptografia de 32 bytes:
   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```
5. No `.env.local` (e no painel da Vercel em produção), defina:
   ```
   SUPABASE_URL=https://xxxx.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=...
   CONNECTIONS_ENCRYPTION_KEY=<hex de 64 caracteres gerado acima>
   ```

Sem essas variáveis configuradas, a tela de conexão funciona normalmente mas
qualquer tentativa de salvar/listar orgs retorna erro — configure antes do
primeiro uso.

## Scripts

```bash
npm run dev              # desenvolvimento (porta 9999)
npm run build            # build de produção
npm start                # servir o build
npm run lint             # ESLint (flat config)
npm test                 # testes (runner nativo do Node: node --test)
npm run gen:credentials  # gera AUTH_SECRET + AUTH_USERS (local escapado / Vercel cru)
```

## Testes e CI

- Testes de unidade das funções puras (anomaly e custo do FinOps) com o runner
  nativo do Node — sem dependências extras. Rode com `npm test`.
- CI no GitHub Actions (`.github/workflows/ci.yml`): em cada push/PR na `main`
  roda `npm ci → lint → test → build`.

## Arquitetura de autenticação

- `src/auth.config.js` — config edge-safe (usada pelo `proxy.js`).
- `src/auth.js` — config principal (Credentials + bcrypt). Lê `AUTH_USERS` (ou o
  fallback de usuário único). Exporta `auth`, `handlers`, `signIn`, `signOut`.
- `proxy.js` — substitui o antigo middleware (renomeado no Next 16).
- `src/app/api/auth/[...nextauth]/route.js` — endpoints do Auth.js.
- `src/app/api/connections/route.js` e `src/app/api/connections/[id]/route.js` —
  CRUD das orgs Datadog do usuário (Supabase, chaves cifradas).

> Segurança: por causa da CVE-2025-29927 (bypass de middleware), as rotas de API
> revalidam a sessão com `auth()` no servidor, em vez de confiar só no `proxy.js`.

## Infra opcional (produção)

Para rate-limit de login e cache de rotas **compartilhados** entre instâncias
serverless (Vercel), defina `UPSTASH_REDIS_REST_URL` e `UPSTASH_REDIS_REST_TOKEN`.
Sem elas, o app usa memória por processo (funciona, mas não é compartilhado).

## Referências

- Auth.js v5 (migração): https://authjs.dev/getting-started/migrating-to-v5
- Auth.js / Next.js: https://authjs.dev/reference/nextjs
- Next.js 16: https://nextjs.org/blog/next-16
- Anomaly Monitors (Datadog): https://docs.datadoghq.com/monitors/types/anomaly/
- Métricas de uso (FinOps): https://docs.datadoghq.com/account_management/billing/usage_metrics/
