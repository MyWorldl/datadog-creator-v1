-- scripts/supabase-schema.sql
--
-- Roda uma vez no SQL Editor do seu projeto Supabase (Project -> SQL Editor).
-- Cria a tabela que guarda as conexões Datadog (múltiplas orgs) por usuário.
--
-- As colunas api_key_enc / app_key_enc guardam as chaves JÁ CIFRADAS pelo
-- servidor (AES-256-GCM, ver src/lib/crypto-keys.js) — nunca texto plano.
-- key_version identifica QUAL versão de CONNECTIONS_ENCRYPTION_KEYS cifrou
-- aquela linha — permite rotacionar a chave sem invalidar dados antigos de
-- uma vez só (ver comentário de rotação em src/lib/crypto-keys.js e o script
-- scripts/reencrypt-connections.mjs, usado quando quiser migrar linhas
-- antigas pra versão atual e aposentar de vez uma chave velha).
--
-- user_id = user.id (UUID do Supabase Auth, ver src/lib/supabase-server.js),
-- com FK pra auth.users(id) ON DELETE CASCADE — remover o usuário no
-- Supabase Auth já remove as conexões dele automaticamente.
--
-- (Histórico: em projetos migrados de uma versão anterior — sem Supabase
-- Auth, user_id era `text` livre — rodar scripts/migrate-users-to-supabase-auth.mjs
-- pra remapear todo mundo ANTES de aplicar o ALTER COLUMN + FK abaixo.)

create extension if not exists pgcrypto;

create table if not exists public.datadog_connections (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  name          text not null,
  site          text not null,
  api_key_enc   text not null,
  app_key_enc   text not null,
  key_version   smallint not null default 1,
  is_active     boolean not null default false,
  created_at    timestamptz not null default now()
);

create index if not exists idx_datadog_connections_user
  on public.datadog_connections (user_id);

-- Garante no máximo 1 conexão ativa por usuário no nível do banco
-- (a aplicação já cuida disso, mas o índice único é uma segunda trava).
create unique index if not exists uq_datadog_connections_one_active_per_user
  on public.datadog_connections (user_id)
  where is_active;

-- RLS: habilitado por padrão em projetos novos do Supabase. Este app só
-- acessa a tabela pelo servidor com a Service Role Key (que ignora RLS), mas
-- deixamos RLS ligado e SEM policies para o public/anon — assim, se a chave
-- anon vazar um dia, ela não consegue ler nem escrever nada aqui.
alter table public.datadog_connections enable row level security;
