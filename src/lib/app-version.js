// src/lib/app-version.js
//
// HISTÓRICO DE VERSÕES — fonte única de verdade.
//
// Como usar a cada deploy:
//   1. Adicione uma nova entrada NO TOPO do array VERSION_HISTORY
//      (versão, data, título e a lista do que mudou).
//   2. Pronto: a página "Sobre" (Sistema -> Sobre) e o APP_VERSION
//      passam a refletir a versão nova.
//
// Dica (automação opcional): em deploys na Vercel, o commit é exposto via
// variável de ambiente. Mostramos o SHA automaticamente quando disponível
// (veja COMMIT_SHA abaixo), mas a versão "humana" e a descrição continuam
// vindo daqui, porque descrevem O QUE mudou — algo que só você sabe.

export const VERSION_HISTORY = [
  {
    version: '1.7.0',
    date: '2026-07-02',
    title: 'Bloco C — redesenho de Serviços, Alertas e Dashboard',
    notes: [
      'Lista de Serviços com busca, chips de ambiente (dev/hml/prd), seleção em massa dos filtrados, contador e tag de ambiente por linha.',
      'Cartões de alerta viraram accordion: cada tipo mostra um resumo em pílulas (algoritmo · sazonalidade · janela · direção · desvios) e expande para editar.',
      'Dashboard redesenhado: faixa com os dois scores (ScopeMaturity + MonitorsAnalytics) lado a lado, stat cards, atalhos das ferramentas e saudação personalizada.',
    ],
  },
  {
    version: '1.7.0',
    date: '2026-07-02',
    title: 'Bloco C — redesigns (Serviços, cartões de alerta e Dashboard)',
    notes: [
      'Lista de Serviços com busca, chips de ambiente (dev/hml/prd), seleção em massa e contador de selecionados.',
      'Cartões de alerta viraram accordion com pílulas-resumo (algoritmo · sazonalidade · janela · direção · desvios).',
      'Dashboard reformulado: ScopeMaturity e MonitorsAnalytics lado a lado, stat cards e atalhos das ferramentas.',
    ],
  },
  {
    version: '1.6.0',
    date: '2026-07-02',
    title: 'Bloco B — Datadog FinOps Insights e redesign do Sobre',
    notes: [
      'Nova ferramenta FinOps Insights com 3 visões: Consumo (Usage Metering API), Análise & Alarme (monitor de anomalia direction=both na métrica de licenciamento) e Custo estimado (preços de lista editáveis).',
      'Custo é estimativa por preço de lista (list ≠ contrato); os preços são editáveis para refletir o contrato real.',
      'Sobre reformulado: hero com resumo do produto, cards de recursos e histórico de versões.',
    ],
  },
  {
    version: '1.5.0',
    date: '2026-07-02',
    title: 'Bloco A — MonitorsAnalytics reformulado e N/D evoluídos',
    notes: [
      'MonitorsAnalytics com 5 KPIs novos (Padronização de Tags, Cobertura de Ativos Críticos, Tempo de Resolução por Severidade, Falsos Positivos, Ação por Alerta) e score 0–100 ponderado.',
      'Falsos Positivos é o KPI de maior peso (0.35) e agora mede flapping real (auto-recuperação em <10min), não recuperações/disparos.',
      'ScopeMaturity: Logs Correlacionados e Logs sem Service (Logs Analytics), Error Budget (SLO history) e Alertas Falsos (eventos) saíram de N/D.',
      'Alta Cardinalidade segue N/D (requer dados de cardinalidade de métricas).',
    ],
  },
  {
    version: '1.4.1',
    date: '2026-07-01',
    title: 'Parâmetros de anomalia por tipo e 4 usuários',
    notes: [
      'Algoritmo, sazonalidade, alert window e direção agora são configuráveis POR TIPO de alerta.',
      'Defaults: Latência robust/weekly/15m/above · Taxa de Erro robust/weekly/5m/above · Alto volume agile/weekly/15m/above · Baixo volume agile/weekly/15m/below.',
      '.env.local recriado com 4 usuários (Gabriel, Daniel, Vitor, Lucas).',
    ],
  },
  {
    version: '1.4.0',
    date: '2026-07-01',
    title: 'MonitorsAnalytics, login por usuário e ajustes',
    notes: [
      'Login agora é por usuário + senha (não e-mail); suporte a múltiplos usuários (AUTH_USERS).',
      'Nova ferramenta MonitorsAnalytics (cobertura, automação, reincidência, falsos positivos).',
      'Dashboard mostra o ScopeMaturity automaticamente ao conectar as chaves.',
      'MonitorsCreator: parâmetros de anomalia configuráveis (algoritmo, sazonalidade, janela, direção).',
      'Removida a aba "monitor de anomalia" manual (o wizard é só descoberta de serviços).',
      'Ícones modernos (SVG) e remoção de código órfão (ServiceDiscovery).',
      '.env.example versionável e regra do $ (local escapado vs Vercel cru) documentada.',
    ],
  },
  {
    version: '1.3.1',
    date: '2026-06-30',
    title: 'Correção: criação de monitores de anomalia',
    notes: [
      'Corrigido erro do Datadog "alert window query arg must match trigger window": o payload usava a chave errada (alert_window) em vez de trigger_window nas opções do monitor.',
    ],
  },
  {
    version: '1.3.0',
    date: '2026-06-30',
    title: 'Anomaly detection, ScopeMaturity e correções',
    notes: [
      'Descoberta agora cria monitores de ANOMALY DETECTION (latência, erro, alto/baixo volume).',
      'Seleção de múltiplas operations por serviço.',
      'Etapa 3: nome do monitor (prefixo) e Tags dos monitores.',
      'ScopeMaturity (ex-"Análise do Ambiente"): score 0–100 calculado no servidor.',
      'Corrigido "Failed to fetch": a análise agora coleta no servidor (sem CORS).',
      'Dashboard: removido o card de Conexão Datadog.',
      'Adicionados Vercel Analytics e Speed Insights.',
    ],
  },
  {
    version: '1.2.0',
    date: '2026-06-30',
    title: 'Descoberta por serviço + wizard completo',
    notes: [
      'Descoberta agora é por serviço (multi-seleção) e mostra quantas operations cada serviço tem.',
      'Alertas de serviço passam pelas 5 etapas do wizard (criação só na Etapa 5).',
      'Etapa 3: seleção de Group By (padrão service, resource_name).',
      'Etapa 3: mensagens-template editáveis, com padrão por tipo de alerta.',
      'Tema "Sistema" (segue o SO) e correção do logo sumindo no tema claro.',
      'Suporte a múltiplos usuários via AUTH_USERS.',
      '"Testar conexão" reposicionado à direita de "Reconfigurar".',
    ],
  },
  {
    version: '1.1.1',
    date: '2026-06-30',
    title: 'Diagnóstico de credenciais',
    notes: [
      'Botão "Testar conexão" em Configurações (valida API + App Key via /api/v2/validate_keys).',
      'Descoberta de serviços agora mostra a mensagem real do Datadog (ex.: 401 = API key inválida ou site errado).',
    ],
  },
  {
    version: '1.1.0',
    date: '2026-06-30',
    title: 'Descoberta de serviços + Analytics + Sobre',
    notes: [
      'MonitorsCreator: descoberta automática de serviços APM e criação de alertas de Latência, Taxa de Erro, Baixo e Alto volume de requisições.',
      'Adicionada integração com Vercel Web Analytics.',
      'Nova página Sistema → Sobre com histórico de versões.',
      'Configurações: removido o bloco "Padrões do monitor".',
    ],
  },
  {
    version: '1.0.1',
    date: '2026-06-30',
    title: 'Correções de fluxo de login',
    notes: [
      'Corrigido loop de redirecionamento para usuários não autenticados.',
      'Resumo do wizard agora mostra o site real da sessão.',
      'Adicionado trustHost no Auth.js para deploys fora da Vercel.',
    ],
  },
  {
    version: '1.0.0',
    date: '2026-06-25',
    title: 'Primeira versão com autenticação e sessão',
    notes: [
      'Tema claro/escuro em todo o app.',
      '"Monitores" renomeado para MonitorsCreator.',
      'Novo Dashboard como tela inicial.',
      'Autenticação real (Auth.js v5 + bcrypt).',
      'API/App Key em cookie httpOnly por sessão.',
    ],
  },
]

// Versão atual = a entrada mais recente do histórico.
export const APP_VERSION = VERSION_HISTORY[0]?.version ?? '0.0.0'

// SHA do commit, se o deploy expôs (ex.: Vercel). Opcional.
export const COMMIT_SHA =
  process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA?.slice(0, 7) || null
