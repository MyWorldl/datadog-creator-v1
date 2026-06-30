# Datadog Creator

Ferramenta interna (Next.js 16 + React 19) para criar monitores de anomalia no
Datadog, com autenticação real e credenciais de sessão.

## Setup rápido

```bash
# 1. Instalar dependências (inclui next-auth@beta e bcryptjs)
npm install

# 2. As credenciais já vêm prontas em .env.local para testar (TROQUE depois).
#    Para gerar as suas:
npm run gen:credentials -- "MinhaSenhaForte123"
#    Cole o AUTH_SECRET e o AUTH_LOGIN_PASSWORD_HASH no .env.local,
#    e ajuste AUTH_LOGIN_EMAIL / AUTH_LOGIN_NAME.

# 3. Rodar
npm run dev      # http://localhost:9999
```

### Login demo (já configurado no .env.local)

- E-mail: admin@ryujin.dev
- Senha:  Datadog!2026

> Troque essas credenciais antes de qualquer uso real: rode `npm run gen:credentials`
> e atualize o `.env.local`. O `.env.local` é ignorado pelo git.

## Variáveis de ambiente (.env.local)

| Variável | O que é |
|---|---|
| AUTH_SECRET | Segredo que assina a sessão (JWT). Gere um aleatório. |
| AUTH_LOGIN_EMAIL | E-mail/usuário único de login. |
| AUTH_LOGIN_NAME | (opcional) Nome exibido. |
| AUTH_LOGIN_PASSWORD_HASH | Hash bcrypt da senha (nunca a senha pura). |

## O que mudou (resumo)

1. Tema Dark/Light — em Sistema -> Configurações -> Tema. Todas as telas passaram
   a usar tokens CSS (var(--...)), então o dark vale no app inteiro.
2. Renomeação — "Monitores" virou MonitorsCreator na navegação.
3. Dashboard — nova aba em Ferramentas com caixas navegáveis e status da conexão.
   É a tela inicial (/ redireciona para ela).
4. Autenticação real — Auth.js (NextAuth v5) com provider Credentials e senha
   verificada por hash bcrypt. Usuário único via variáveis de ambiente (sem
   banco). Para múltiplos usuários, veja src/auth.js (">>> PLUGUE O BANCO AQUI").
5. Credenciais de sessão — API Key + App Key são configuradas uma vez por sessão
   e guardadas em cookies httpOnly no servidor (o JS do browser nunca as lê).

## Arquitetura de autenticação

- src/auth.config.js — config edge-safe (usada pelo proxy.js).
- src/auth.js — config principal (Credentials + bcrypt). Exporta auth, handlers,
  signIn, signOut.
- proxy.js — substitui o antigo middleware (renomeado no Next 16).
- src/app/api/auth/[...nextauth]/route.js — endpoints do Auth.js.
- src/app/api/session/keys/route.js — grava/limpa as chaves em cookies httpOnly.

> Segurança: por causa da CVE-2025-29927 (bypass de middleware), as rotas de API
> revalidam a sessão com auth() no servidor, em vez de confiar só no proxy.

## Referências

- Auth.js v5 (migração): https://authjs.dev/getting-started/migrating-to-v5
- Auth.js / Next.js: https://authjs.dev/reference/nextjs
- Next.js 16: https://nextjs.org/blog/next-16
