# Datadog Creator

Conjunto de ferramentas internas de Engenharia de Vendas para **Datadog**
(Next.js 16 + React 19, TypeScript). Autenticação real por usuário via
**Supabase Auth** (e-mail + senha), suporte a **múltiplas orgs Datadog por
usuário** (chaves cifradas e guardadas no Supabase), e coleta feita no servidor.

## Ferramentas

- **Dashboard** — visão geral do ambiente conectado, com atalhos pras demais ferramentas.
- **MonitorsCreator** — descobre hosts/serviços/namespaces e cria monitores (threshold, *anomaly detection* e *outlier detection*), com parâmetros por tipo de alerta (algoritmo, sazonalidade, alert window, direção). Três abas: APM (por serviço/namespace), Infraestrutura (por host: CPU/Memória/Disco/Rede/Load) e, atrás de feature flag, APM e Infraestrutura (K8s/DBM: Node Ready, banco de dados, Pod Restarts, Pod Pending).
- **AuditMonitors** — analisa o ambiente e mostra, métrica a métrica, quais hosts/serviços têm monitor e quais estão sem cobertura (score 0–100 ponderado pela % real de cobertura), com sugestão pronta de monitores para as lacunas.
- **ScopeMaturity** — score de governança/cobertura do ambiente (tags, SLO/error budget, logs, etc.).
- **FinOps Insights** — consumo por licenciamento, alarme de anomalia de consumo e custo estimado.

## Setup rápido

```bash
# 1. Instalar dependências
npm install

# 2. Criar o .env.local a partir do exemplo (o .env.local é ignorado pelo git)
cp .env.example .env.local
```

Depois, configure o Supabase (obrigatório — é usado tanto para login quanto
para guardar as orgs Datadog) seguindo a seção "Supabase (auth + orgs)"
abaixo e preencha as variáveis correspondentes no `.env.local`. Com isso
feito:

```bash
# 3. Criar o primeiro usuário (recebe um e-mail pra definir a senha)
node --env-file=.env.local scripts/create-supabase-user.mjs "seu@email.com" "Seu Nome"

# 4. Rodar
npm run dev      # http://localhost:9999
```

> O login é por **e-mail + senha** (Supabase Auth) — a senha é definida pelo
> próprio usuário pelo link recebido por e-mail, nunca por quem cria o acesso.

## Variáveis de ambiente (`.env.local`)

Todas documentadas com contexto em `.env.example` — resumo abaixo.

**Obrigatórias** (login e armazenamento de orgs Datadog não funcionam sem elas):

| Variável | O que é |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` | URL e chave `anon`/`publishable` do projeto Supabase — client-safe, usadas pelo browser e pelo servidor para checar sessão. |
| `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` | Mesma URL + chave `service_role` (nunca client-safe) — só server-only, para CRUD administrativo de conexões e criação de usuário. |
| `CONNECTIONS_ENCRYPTION_KEYS` / `CONNECTIONS_ENCRYPTION_KEY_VERSION` | Mapa versionado `{"versão":"chave"}` usado para cifrar (AES-256-GCM) as API Key/App Key do Datadog antes de gravar no Supabase, e qual versão cifra dados novos. Ver rotação sem downtime em `.env.example`. |

**Opcionais**:

| Variável | O que é |
|---|---|
| `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` | Redis compartilhado entre instâncias serverless, para rate-limit de login e cache de rotas. Sem elas, usa memória por processo. |
| `NEXT_PUBLIC_SENTRY_DSN` (+ `SENTRY_ORG`/`SENTRY_PROJECT`/`SENTRY_AUTH_TOKEN`) | Captura de erro em produção. Sem o DSN, o Sentry nunca inicializa. |
| `FEATURE_OUTLIER_DETECTION` / `FEATURE_K8S_DBM_COVERAGE` | Feature flags (ver `src/lib/feature-flags.ts`) — `"true"` liga, qualquer outro valor (ou ausente) mantém desligado. |

As chaves do Datadog (API Key, App Key, site) **não** vão no `.env` — cada
usuário conecta quantas orgs quiser pela interface (Configurações ou Step 1 do
wizard). Elas ficam **cifradas** numa tabela no **Supabase**.

## Supabase (auth + orgs)

O mesmo projeto Supabase cobre duas coisas: autenticação dos usuários do app
(login por e-mail/senha) e a tabela de conexões Datadog salvas por usuário
(múltiplas orgs — cada uma pode salvar N conexões e alternar entre elas sem
digitar as chaves de novo; só uma fica "ativa" por vez).

1. Crie um projeto em https://supabase.com (grátis).
2. No **SQL Editor** do projeto, rode o conteúdo de `scripts/supabase-schema.sql`
   (cria a tabela `datadog_connections`).
3. Em **Project Settings → API**, copie a **Project URL**, a chave
   **anon**/**publishable** (client-safe) e a chave **service_role** (nunca
   client-safe, só usada no servidor).
4. Gere uma chave de criptografia de 32 bytes:
   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```
5. No `.env.local` (e no painel da Vercel em produção), preencha
   `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_URL`,
   `SUPABASE_SERVICE_ROLE_KEY` e `CONNECTIONS_ENCRYPTION_KEYS` (com a chave
   gerada acima) — ver `.env.example` para o formato exato de cada uma.
6. Crie/revogue acesso de usuários pelo **Supabase Dashboard**
   (Authentication → Users) ou via
   `node --env-file=.env.local scripts/create-supabase-user.mjs "email@empresa.com" "Nome"`.

Sem essas variáveis configuradas, o app não autentica ninguém e qualquer
tentativa de salvar/listar orgs retorna erro — configure antes do primeiro uso.

## Scripts

```bash
npm run dev                    # desenvolvimento (porta 9999)
npm run build                  # build de produção
npm start                      # servir o build
npm run lint                   # ESLint (flat config)
npm run typecheck              # tsc --noEmit
npm test                       # testes (runner nativo do Node: node --test)
npm run check:version          # confere package.json x VERSION_HISTORY (roda no CI)
npm run bump:version           # atualiza package.json + insere entrada em VERSION_HISTORY
```

## Testes e CI

- Testes de unidade das funções puras (`tests/*.test.js`: discovery/infra —
  query e payload dos monitores, incl. anomaly/outlier/threshold —, audit,
  schemas, feature flags, rate-limit, FinOps, cache de rota) com o runner
  nativo do Node — sem dependências extras. Rode com `npm test`.
- CI no GitHub Actions (`.github/workflows/ci.yml`): em cada push/PR na `main`
  roda `npm ci → check:version → npm audit → lint → typecheck → test → build`.

## Arquitetura de autenticação

Login e sessão são 100% **Supabase Auth** (e-mail + senha) — não há mais
Auth.js/NextAuth neste projeto.

- `src/lib/supabase-server.ts` — client Supabase pro servidor (chave `anon` +
  cookies do App Router). Exporta `getServerUser()`, que usa `getUser()`
  (revalida o JWT contra o Supabase, nunca só decodifica o cookie) — é o que
  toda rota de API sensível chama para checar autenticação.
- `src/lib/supabase-admin.ts` — client `service_role` (ignora RLS), só para
  operações administrativas server-only: CRUD de conexões, criação de usuário.
- `src/app/api/auth/login/route.ts` — login por e-mail/senha; fica num Route
  Handler (em vez do browser chamar `signInWithPassword` direto) para manter
  o rate-limit por IP (`src/lib/rate-limit.ts`) no caminho.
- `src/context/SupabaseAuthContext.tsx` — sessão no client; a UI (AppShell) só
  renderiza conteúdo autenticado quando essa sessão está confirmada.
- `proxy.ts` (raiz do projeto) — substitui o antigo middleware (renomeado no
  Next 16). Refresca o cookie de sessão do Supabase a cada request e aplica
  throttle geral em `/api/connections/*` e `/api/datadog/*`.
- `src/app/api/connections/route.ts` e `src/app/api/connections/[id]/route.ts` —
  CRUD das orgs Datadog do usuário (Supabase, chaves cifradas).

> Segurança: por causa da CVE-2025-29927 (bypass de middleware via header
> forjado), `proxy.ts` é só a primeira camada — as rotas de API que mexem com
> dados sensíveis revalidam a sessão com `getServerUser()` no servidor, em vez
> de confiar só no proxy.

## Infra opcional (produção)

Para rate-limit de login e cache de rotas **compartilhados** entre instâncias
serverless (Vercel), defina `UPSTASH_REDIS_REST_URL` e `UPSTASH_REDIS_REST_TOKEN`.
Sem elas, o app usa memória por processo (funciona, mas não é compartilhado).

## Referências

- Supabase Auth: https://supabase.com/docs/guides/auth
- Next.js 16: https://nextjs.org/blog/next-16
- Anomaly Monitors (Datadog): https://docs.datadoghq.com/monitors/types/anomaly/
- Outlier Detection (Datadog): https://docs.datadoghq.com/dashboards/functions/algorithms/
- Métricas de uso (FinOps): https://docs.datadoghq.com/account_management/billing/usage_metrics/
