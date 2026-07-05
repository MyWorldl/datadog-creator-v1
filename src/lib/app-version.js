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
    version: '1.12.3',
    date: '2026-07-04',
    title: 'Cards no estilo Modelo E (gradiente + ícone)',
    notes: [
      'CollapsibleCard redesenhado: acento em gradiente sutil da cor de status, ícone de status em quadrado tingido, número grande e mais respiro — aplicado no ScopeMaturity e no MonitorsAnalytics.',
      'Status agora é comunicado por forma (ícone) + cor + número (reforça o WCAG 1.4.1). Mantém o expandir/colapsar com transição suave.',
    ],
  },
  {
    version: '1.12.2',
    date: '2026-07-04',
    title: 'Reanálise: README atualizado, CI e limpeza',
    notes: [
      'README reescrito para o modelo atual de login por usuário (AUTH_USERS), com a regra de escape do $ e as ferramentas atuais.',
      'Adicionado CI no GitHub Actions (.github/workflows/ci.yml): lint + testes + build em cada push/PR na main.',
      'Removido export órfão incidents() de datadog-server.js (sobrou da troca de KPIs do MonitorsAnalytics).',
    ],
  },
  {
    version: '1.12.1',
    date: '2026-07-04',
    title: 'FinOps: detecta summary parcial de Sub-Org e cai para métricas',
    notes: [
      'Corrige o caso em que o usage/summary volta incompleto (ex.: só Custom Metrics) numa Sub-Org: antes, como vinha 1 produto, o app não caía para as métricas estimated_usage.* e mostrava só aquele produto.',
      'Agora o fallback dispara também quando o summary não traz os agregados principais (infra/APM/logs), passando a usar as métricas por org (que funcionam em Sub-Org).',
    ],
  },
  {
    version: '1.12.0',
    date: '2026-07-03',
    title: 'FinOps: agregação correta do consumo por licenciamento',
    notes: [
      'Containers passam a ser agregados por média do mês (como o Datadog fatura), não por pico.',
      'Hosts (infra/APM/DBM/profiler/network) usam high-water mark do p99 em vez do máximo absoluto — não estoura com picos pontuais.',
      'Queries de métricas de uso agora usam rollup explícito por hora (soma/pico/média), tornando o total do mês determinístico.',
      'Nova seção Diagnóstico na aba Consumo: mostra a query, o nº de pontos e o valor de cada métrica estimated_usage retornada pela Metrics API.',
    ],
  },
  {
    version: '1.11.2',
    date: '2026-07-03',
    title: 'Ajuste de layout dos cards (fim do corte de título)',
    notes: [
      'Colunas mais largas nos cards de ScopeMaturity e MonitorsAnalytics (minmax 300px com guard min(100%,300px)).',
      'Título passa a quebrar em até 2 linhas (line-clamp) em vez de cortar em 1; alinhamento ao topo.',
      'Score com fonte adaptativa: valores longos como "3,1 disp./mon" encolhem para não roubar espaço do título.',
    ],
  },
  {
    version: '1.11.1',
    date: '2026-07-03',
    title: 'Cards com borda de acento lateral (status)',
    notes: [
      'CollapsibleCard ganhou uma faixa colorida de 3px à esquerda indicando o status (verde/amarelo/vermelho) — aplicada no ScopeMaturity e no MonitorsAnalytics.',
      'A cor é redundante com o score e o detalhe (atende ao WCAG 1.4.1 — não depende só de cor); N/D usa cor neutra.',
    ],
  },
  {
    version: '1.11.0',
    date: '2026-07-03',
    title: 'Cards colapsáveis em ScopeMaturity e MonitorsAnalytics',
    notes: [
      'Novo componente CollapsibleCard (React + Tailwind): por padrão mostra só título e score; ao clicar, revela a descrição com transição suave de altura.',
      'Animação via CSS Grid (grid-template-rows 0fr → 1fr) — anima até a altura natural do conteúdo sem altura fixa nem JS medindo.',
      'Acessível: cabeçalho é um <button> com aria-expanded/aria-controls e chevron que gira.',
      'Aplicado às dimensões do ScopeMaturity e aos KPIs do MonitorsAnalytics.',
    ],
  },
  {
    version: '1.10.0',
    date: '2026-07-03',
    title: 'Ajustes de KPIs, ScopeMaturity e UX do wizard',
    notes: [
      'MonitorsAnalytics: "Tempo de Resolução por Severidade" virou "Densidade de Alertas por Monitor" (disparos ÷ monitores, expõe vizinhos barulhentos).',
      'MonitorsAnalytics: "Taxa de Ação por Alerta" virou "Taxa de Alertas Auto-Resolvidos" (recuperação <2min; threshold sensível demais). Removida a dependência de Incidents.',
      'ScopeMaturity: removida a dimensão "Tags Obrigatórias" (redundante com Tag Compliance).',
      'ScopeMaturity: detalhes agora explicam o porquê do score — ex.: Tag Compliance mostra a cobertura por tag e aponta o gargalo.',
      'Dashboard: removida a faixa de stat cards (Monitores/KPIs/Dimensões/site).',
      'MonitorsCreator: removido o filtro de Ambiente (env); busca de serviços agora aceita vários termos por vírgula (svc1, svc2, svc3).',
    ],
  },
  {
    version: '1.9.1',
    date: '2026-07-02',
    title: 'FinOps: corrige Sub-Org que responde 200 vazio',
    notes: [
      'A Usage Metering pública, em Sub-Org, costuma responder HTTP 200 sem os campos de consumo (em vez de 403). Agora o fallback para métricas datadog.estimated_usage.* também dispara nesse caso (200 sem nenhum produto reconhecido), não só em erro HTTP.',
      'Subcaso raro (summary vazio + métricas sem pontos) passa a informar via aviso, sem estourar erro 502.',
    ],
  },
  {
    version: '1.9.0',
    date: '2026-07-02',
    title: 'FinOps: consumo em contas não-parent (Sub-Org)',
    notes: [
      'FinOps agora funciona sem parent-org: quando a Usage Metering API falha (403/vazio), cai automaticamente para as métricas datadog.estimated_usage.* via Metrics Query API, que respondem em qualquer org.',
      'Cada produto é agregado como o Datadog fatura: hosts pelo pico (rollup max), custom metrics pela média, e logs/RUM/synthetics pela soma (.as_count()).',
      'Nomes de métricas corrigidos conforme a doc oficial (ex.: apm_hosts, metrics.custom) — o que também melhora o alarme de anomalia de consumo.',
      'A tela indica a fonte usada (Usage Metering oficial × Métricas estimadas) e alerta sobre a margem de ~10–20% do uso estimado.',
    ],
  },
  {
    version: '1.8.1',
    date: '2026-07-02',
    title: 'Limpeza — remoção dos wrappers finos do wizard',
    notes: [
      'O MonitorsCreator passou a importar os componentes de descoberta (DiscoveryConfigure/Personalize/Review/Create) diretamente.',
      'Removidos 4 wrappers que só repassavam props (StepConfigure/StepPersonalize/StepReview/StepCreate); Stepper e StepConnect permanecem por serem componentes reais.',
    ],
  },
  {
    version: '1.8.0',
    date: '2026-07-02',
    title: 'Upgrades — paginação, cache distribuído, testes e robustez',
    notes: [
      'Listagem de monitores agora é paginada (evita timeout 504 em orgs grandes) — aplicada em MonitorsAnalytics e ScopeMaturity.',
      'MonitorsAnalytics passou a usar cache curto de rota (consistência com ScopeMaturity e FinOps), reduzindo risco de 429.',
      'Rate-limit de login e cache de rotas ganharam backend opcional em Redis (Upstash via REST, sem dependência): estado compartilhado entre instâncias serverless quando UPSTASH_REDIS_REST_URL/TOKEN estão definidos; caem para memória caso contrário.',
      'Testes automatizados (node --test, sem dependências) para as funções puras de anomaly (discovery) e de custo (FinOps).',
      'Robustez: comentado o comportamento do aggregation_key de eventos (mudança do Datadog em mar/2025) no pareamento de flapping.',
    ],
  },
  {
    version: '1.7.1',
    date: '2026-07-02',
    title: 'Manutenção — correção de bug e limpeza de código',
    notes: [
      'Corrige o erro de chave duplicada na tela Sobre (havia duas entradas de versão 1.7.0 no histórico).',
      'Remove código morto: componente ServiceDiscovery.jsx (órfão) e a rota /api/create-monitor (não utilizada).',
    ],
  },
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
