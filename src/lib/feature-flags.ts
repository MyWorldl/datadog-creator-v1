// src/lib/feature-flags.ts
//
// Feature flags simples via variável de ambiente — liga/desliga uma
// funcionalidade sem precisar mexer em código, só trocando o valor no
// Vercel (Project Settings -> Environment Variables) e fazendo um redeploy.
//
// Por que env var e não um serviço dedicado (LaunchDarkly, GrowthBook etc.)
// ou uma tabela no Supabase: esta é uma ferramenta interna de uso pontual,
// não um produto com muitos usuários simultâneos disputando rollout gradual
// — o cenário real é "eu mesmo lancei uma feature nova arriscada, quero
// poder desligar rápido sem reverter o merge". Uma env var resolve isso sem
// a complexidade de admin UI/migração de banco; se um dia surgir a
// necessidade real de rollout por usuário/org, dá pra evoluir pra uma
// tabela sem quebrar o contrato de isFeatureEnabled()/getEnabledFeatures().
//
// Nunca prefixadas com NEXT_PUBLIC_ de propósito: a checagem sempre passa
// por aqui (server-only) e chega ao client só via /api/feature-flags
// (autenticado) — assim o valor não fica visível no bundle JS pra quem
// abrir o DevTools, e trocar a flag não exige rebuild do client, só do
// servidor (Vercel: redeploy sem novo commit já é suficiente).
//
// Convenção pra adicionar uma flag nova: escolha uma chave em FeatureFlag,
// registre o nome da env var em FLAG_ENV, documente no .env.example. Uma
// flag sem env var definida é FALSE por padrão (fail-closed — feature nova
// começa desligada até alguém ligar de propósito).

export type FeatureFlag = 'outlierDetection' | 'k8sDbmCoverage' | 'logMonitors'

const FLAG_ENV: Record<FeatureFlag, string> = {
  // Outlier Detection no MonitorsCreator (monitor que detecta host/container
  // fora do padrão do grupo, via outlier() — ver backlog).
  outlierDetection: 'FEATURE_OUTLIER_DETECTION',
  // Cobertura de Kubernetes e Database Monitoring no AuditMonitors (novos
  // grupos no AUDIT_CATALOG — ver backlog).
  k8sDbmCoverage: 'FEATURE_K8S_DBM_COVERAGE',
  // Log Monitor no MonitorsCreator (contagem de logs por filtro — ver
  // lib/log-monitors.ts). Desligado por padrão: v1 cobre só rollup "count",
  // sem measure/groupBy (sintaxe ainda não confirmada pra esses dois).
  logMonitors: 'FEATURE_LOG_MONITORS',
}

export function isFeatureEnabled(flag: FeatureFlag): boolean {
  return process.env[FLAG_ENV[flag]] === 'true'
}

export type FeatureFlagState = Record<FeatureFlag, boolean>

// Lista de chaves conhecidas — reaproveitada pelo client (AppContext) pra
// montar o estado "tudo desligado" inicial sem precisar duplicar os nomes
// das flags em dois lugares.
export const FEATURE_FLAG_KEYS: FeatureFlag[] = Object.keys(FLAG_ENV) as FeatureFlag[]

// Snapshot de todas as flags conhecidas — usado pela rota /api/feature-flags
// pra mandar o estado inteiro pro client de uma vez (evita 1 checagem por flag).
export function getEnabledFeatures(): FeatureFlagState {
  return Object.fromEntries(
    (Object.keys(FLAG_ENV) as FeatureFlag[]).map(flag => [flag, isFeatureEnabled(flag)])
  ) as FeatureFlagState
}
