// src/lib/app-version.js
//
// HISTÓRICO DE VERSÕES — fonte única de verdade.
//
// Como usar a cada deploy (evita a versão do package.json dessincronizar
// desta lista, como já aconteceu nas v1.7.1 e v1.17.1):
//   node scripts/bump-version.mjs <versão> "<título>" "<nota 1>" ["<nota 2>" ...]
// Isso atualiza o "version" do package.json E insere a entrada no topo do
// VERSION_HISTORY abaixo numa única execução. O CI roda
// scripts/check-version-sync.mjs e falha o build se os dois não baterem —
// então editar só um dos dois manualmente não passa despercebido.
//
// Pronto: a página "Sobre" (Sistema -> Sobre) e o APP_VERSION passam a
// refletir a versão nova.
//
// Dica (automação opcional): em deploys na Vercel, o commit é exposto via
// variável de ambiente. Mostramos o SHA automaticamente quando disponível
// (veja COMMIT_SHA abaixo), mas a versão "humana" e a descrição continuam
// vindo daqui, porque descrevem O QUE mudou — algo que só você sabe.

export const VERSION_HISTORY = [
  {
    version: '1.29.0',
    date: '2026-07-22',
    title: 'AuditMonitors: cobertura por serviço (APM), % real, preview antes de criar',
    notes: [
      'Nova tabela "Cobertura de APM por serviço" (igual à de Infra por host) — lista quais serviços estão sem cada tipo de monitor.',
      'Cards de métrica trocaram o binário "existe 1 monitor = 100%" por % real (cobertos/total), com cor por faixa: <=40% vermelho, 40-75% amarelo, >=75% verde.',
      'Corrigido bug real descoberto no processo: a sugestão de monitores de Infra ignorava a cobertura por host e podia deixar de sugerir uma métrica pra 86 hosts só porque 1 host já tinha 1 monitor dela — agora a sugestão (Infra e o novo APM) é precisa por entidade.',
      'Botão "Criar os que faltam" agora abre um preview da lista de monitores (nome/query, já refletindo os ajustes de queryWindow/evaluation_delay de hoje) com confirmação explícita antes de criar de verdade — pros dois fluxos, Infra e o novo de APM.',
    ],
  },
  {
    version: '1.28.0',
    date: '2026-07-22',
    title: 'MonitorsCreator (Infra): mesmos ajustes aplicados ao fluxo de serviços',
    notes: [
      'queryWindow padrão de infra subiu de last_10m para last_1h (~4x o alertWindow de 15m, alinhado à recomendação Datadog pro modo anomaly) e evaluation_delay:60 passou a ser o padrão nos monitores de métrica (antes nunca era ativado).',
      'Etapa Configurar de Infraestrutura também virou um mini-wizard de 2 sub-fases (Hosts / Métricas), por consistência visual com o fluxo de Serviços/Namespace.',
    ],
  },
  {
    version: '1.27.0',
    date: '2026-07-22',
    title: 'MonitorsCreator: métricas alinhadas ao Datadog + Configurar em sub-etapas',
    notes: [
      'queryWindow (janela externa do avg() em anomalies()) agora escala por tipo de alerta (~5x o alert_window), em vez de um valor fixo de 4h pros 4 tipos — antes o errorRate avaliava com 48x o alert_window, muito acima do recomendado pela doc do Datadog.',
      'Todo monitor criado agora define evaluation_delay:60, alinhado ao interval=60 da query (recomendação oficial pra evitar falso alarme por dado ainda incompleto).',
      'Etapa Configurar virou um mini-wizard de 3 sub-fases (Entidades / Operações / Alertas) em vez de um card único com tudo empilhado — reduz o scroll longo e antecipa a validação de cada fase pro momento certo, em vez de só no fim.',
    ],
  },
  {
    version: '1.26.0',
    date: '2026-07-21',
    title: 'MonitorsCreator: descoberta automática de namespace/operation',
    notes: [
      'Modo Namespace ganhou descoberta automática (via Datadog Metrics API) tanto dos kube_namespace quanto das operations dentro de cada namespace — antes era tudo digitado manualmente.',
      'A descoberta usa a API de métricas de trace (não amostrada) em vez da Spans Analytics (amostrada, que retornava listas vazias de forma imprevisível).',
      'Operations por namespace são descobertas em 2 passos (namespace → serviços → operations por serviço) porque a tag kube_namespace não é propagada com a mesma cobertura que service nas métricas — filtrar direto perdia a maioria das operations.',
      'Descoberta de namespace mantém entrada manual como complemento (cobre namespaces sem correlação nas sondas usadas).',
      'Removidos os chips de filtro dev/hml/prd da tela Configurar (filtro client-side por nome, não tinha relação real com o ambiente consultado).',
    ],
  },
  {
    version: '1.25.0',
    date: '2026-07-21',
    title: 'MonitorsCreator: escopo por Namespace + tag de operation',
    notes: [
      'Novo toggle Por Serviço / Por Namespace na etapa Configurar — no modo namespace, um único monitor cobre todos os serviços de um kube_namespace (query e tags trocam service: por kube_namespace:).',
      'Todo monitor criado agora recebe também a tag operation:<operation>, além das já existentes.',
    ],
  },
  {
    version: '1.24.1',
    date: '2026-07-13',
    title: 'Prioridade dos monitores: padrão P3',
    notes: [
      'O seletor de Prioridade (P1-P5) na etapa Personalizar agora nasce com P3 marcado por padrão em todos os tipos de alerta/métrica, em vez de "Sem prioridade" — ainda dá pra trocar pra outra prioridade ou remover manualmente por tipo.',
    ],
  },
  {
    version: '1.24.0',
    date: '2026-07-13',
    title: 'MonitorsCreator: prioridade dos monitores + exportar Excel',
    notes: [
      'Novo campo de Prioridade (P1-P5, campo nativo do Datadog) por tipo de alerta/métrica na etapa Personalizar do wizard — antes o app não definia prioridade nenhuma nos monitores criados.',
      'Etapa Criar ganhou botão \'Baixar Excel\' após a criação, com ID, Nome do Monitor, Prioridade, Nome do host/serviço e a primeira linha da mensagem — só dos monitores efetivamente criados (não inclui os que já existiam/foram pulados).',
      'Geração via exceljs (client-side, carregado sob demanda só quando o botão é clicado) — optamos por essa lib em vez da mais popular \'xlsx\' por causa de duas vulnerabilidades conhecidas (Prototype Pollution + ReDoS) nela.',
    ],
  },
  {
    version: '1.23.2',
    date: '2026-07-11',
    title: 'Config: fixar versão do Node no engines (evita upgrade automático)',
    notes: [
      'package.json engines.node era ">=22" (faixa aberta) — o Vercel avisa que isso pode atualizar sozinho pra um Node 23/24 quando virar padrão lá, sem redeploy pedido. Fixado em "22.x" (permite patch/minor dentro do 22, nunca pula de major sozinho).',
    ],
  },
  {
    version: '1.23.1',
    date: '2026-07-11',
    title: 'Correção: convite/recovery não autenticava + middleware quebrava com sessão apagada',
    notes: [
      'O client do browser (@supabase/ssr) usa flowType \'pkce\' fixo, que só processa links com ?code=. Links gerados pela Admin API (convite, recovery) sempre voltam com os tokens em #access_token=... (hash) — sem tratamento manual, a sessão nunca era criada e a pessoa ficava presa na tela de login mesmo clicando no link certo.',
      'proxy.js chamava getUser() sem tratamento de erro: um cookie de sessão apontando pra um usuário já removido do Supabase Auth fazia a chamada lançar exceção, derrubando o middleware inteiro (Internal Server Error) em toda requisição até o cookie expirar.',
      'Nova tela \'Senha da conta\' em Configurações — necessária porque aceitar um convite só autentica temporariamente, não define senha nenhuma; sem isso, a pessoa nunca conseguiria logar de novo via e-mail/senha depois que a sessão expirasse.',
    ],
  },
  {
    version: '1.23.0',
    date: '2026-07-11',
    title: 'MonitorsCreator: mensagens de alerta mais ricas + tela Configurar reorganizada',
    notes: [
      'Mensagens de todos os tipos de alerta (serviços e infra) ganharam formato padronizado: O que monitora, Por que importa, Causas prováveis e Ação recomendada — antes eram uma linha só.',
      'Tela Configurar do wizard reorganizada: busca/filtro de serviços sempre visível, opções de alert window unificadas entre serviços e infra (ALERT_WINDOW_OPTIONS), campos \'Sem dados\' e \'Renotificar\' removidos em favor do padrão do Datadog (menos configuração manual pra decidir).',
    ],
  },
  {
    version: '1.22.0',
    date: '2026-07-11',
    title: 'Segurança: versionamento da chave de criptografia',
    notes: [
      'CONNECTIONS_ENCRYPTION_KEY virou CONNECTIONS_ENCRYPTION_KEYS (mapa versão->chave) + CONNECTIONS_ENCRYPTION_KEY_VERSION — rotacionar a chave não invalida mais os dados já salvos, cada linha de datadog_connections guarda em qual versão foi cifrada (key_version).',
      'Novo scripts/reencrypt-connections.mjs migra linhas de versões antigas para a versão atual quando quiser aposentar de vez uma chave (suporta --dry-run).',
      'Documentado explicitamente (route-cache.js) que o cache de rotas do Datadog não é rate-limit/proteção contra abuso — só reduz chamadas repetidas. Decisão consciente de não adicionar limite real por usuário nas rotas /api/datadog/*/api/connections/* por ora.',
    ],
  },
  {
    version: '1.21.2',
    date: '2026-07-11',
    title: 'Histórico de versões: bump automatizado + checagem no CI',
    notes: [
      'Novo scripts/bump-version.mjs atualiza package.json e insere a entrada em VERSION_HISTORY numa única execução, eliminando a classe de bug que já causou dessincronia duas vezes (v1.7.1 e v1.17.1).',
      'CI agora roda scripts/check-version-sync.mjs antes do build e falha se package.json.version e VERSION_HISTORY[0].version não baterem.',
    ],
  },
  {
    version: '1.21.1',
    date: '2026-07-11',
    title: 'MonitorsCreator: steps do wizard carregados sob demanda',
    notes: [
      'Os componentes dos steps 2 a 5 do wizard (Configurar, Personalizar, Revisar, Criar) agora usam next/dynamic — só entram no bundle do navegador quando o usuário avança até ali, em vez de todos serem carregados juntos ao abrir /monitor.',
      'O App Router já divide o JS por rota automaticamente; esse ajuste divide também DENTRO da rota /monitor, que reunia os 6 steps do wizard num único bundle mesmo mostrando 1 por vez.',
    ],
  },
  {
    version: '1.21.0',
    date: '2026-07-10',
    title: 'Login migrado para Supabase Auth (e-mail + senha)',
    notes: [
      'Substituído o next-auth (usuários fixos na env var AUTH_USERS, exigindo redeploy pra criar/revogar acesso) pelo Supabase Auth: login agora é por e-mail + senha própria de cada pessoa, com "esqueci minha senha" nativo.',
      'Criar ou revogar acesso de alguém agora é feito no Supabase Dashboard (Authentication → Users) ou via scripts/create-supabase-user.mjs, sem editar env var nem fazer redeploy.',
      'datadog_connections.user_id passou a ter integridade referencial real (uuid com FK pra auth.users, ON DELETE CASCADE) — remover um usuário no Supabase Auth já remove automaticamente as conexões Datadog salvas dele.',
      'Rate-limit de login por IP foi preservado (mesma proteção contra força bruta de antes, agora aplicada antes da chamada ao Supabase Auth).',
    ],
  },
  {
    version: '1.20.1',
    date: '2026-07-08',
    title: 'Correção: flyout da sidebar não aparecia mais',
    notes: [
      'O <nav> da sidebar tinha ficado com "overflow-y: auto" (resquício da versão em accordion, que podia crescer em altura). Pela regra do CSS, definir overflow-y força o overflow-x a virar "auto" também — isso cortava (clipava) o flyout, que é posicionado pra fora da caixa do nav, à direita.',
      'Removido o overflow-y do nav (a lista de 4 categorias não precisa de scroll interno). O flyout volta a aparecer normalmente.',
    ],
  },
  {
    version: '1.20.0',
    date: '2026-07-08',
    title: 'Sidebar: accordion embutido virou flyout lateral (com o visual corrigido)',
    notes: [
      'A lista de recursos de cada categoria voltou a abrir AO LADO da sidebar (flyout), como no primeiro pedido — a versão 1.19.x tinha trocado por um accordion que expandia pra baixo dentro da sidebar.',
      'Dessa vez o flyout usa a mesma cor de fundo e paleta da sidebar (roxo escuro / --bg-sidebar), sem borda do lado que encosta nela — fica parecendo uma extensão da sidebar crescendo pra direita, não mais uma caixa clara solta flutuando por cima da página (que foi o problema visual relatado na v1.18.x).',
      'Continua abrindo no hover (mouse em cima), com um pequeno atraso ao sair pra dar tempo de mover o cursor até os itens; clique no cabeçalho continua funcionando como alternativa (essencial em touch).',
      'No mobile, onde a sidebar off-canvas ocupa quase toda a largura da tela, não há espaço pro flyout lateral — ali ele continua aparecendo como lista logo abaixo do botão, na mesma paleta.',
      'Mantido de antes: Home e Financeiro mostram seu único recurso na lista (Dashboard / FinOps Insights) igual às demais categorias; a categoria da página atual abre sozinha ao navegar.',
    ],
  },
  {
    version: '1.19.1',
    date: '2026-07-08',
    title: 'Sidebar: accordion volta a abrir no hover + Home/Financeiro consistentes',
    notes: [
      'A 1.19.0 trocou o hover por clique pra abrir as categorias; voltou a ser hover (mouse em cima expande), só que agora combinado com o accordion embutido — ou seja, expande dentro da própria sidebar, sem flutuar por cima da página como no primeiro flyout.',
      'Home e Financeiro (que têm só 1 recurso cada) agora funcionam igual às demais categorias: expandem e mostram "Dashboard" / "FinOps Insights" como item selecionável na lista, em vez de navegar direto sem mostrar nada — antes ficavam sem mostrar o recurso.',
      'Clique no cabeçalho continua funcionando como alternativa ao hover (essencial em touch, onde não existe hover).',
      'Mantido: abre sozinho a categoria correspondente à página atual ao navegar.',
    ],
  },
  {
    version: '1.19.0',
    date: '2026-07-08',
    title: 'Sidebar: flyout flutuante virou accordion embutido',
    notes: [
      'O menu de categorias (Observabilidade, Sistema) deixou de abrir num popup flutuando ao lado da sidebar (fundo claro, sombra, por cima do conteúdo da página) e passou a expandir LOGO ABAIXO, dentro da própria sidebar — mesmo visual do resto da navegação, mesma paleta roxa escura.',
      'Trigger passou de hover para clique em todas as telas (antes era hover no desktop e clique no mobile); mais previsível e sem risco de fechar sozinho ao mover o mouse.',
      'A categoria correspondente à página atual abre sozinha ao navegar (ex.: entrar em AuditMonitors expande "Observabilidade" automaticamente), pra sempre indicar onde você está.',
      'Reaproveitada a mesma técnica de animação de altura (CSS Grid 0fr → 1fr) já usada no CollapsibleCard, então o comportamento fica consistente com o resto do app.',
    ],
  },
  {
    version: '1.18.1',
    date: '2026-07-08',
    title: 'Correção: erro de console "font" vs "fontWeight" no Sidebar',
    notes: [
      'O botão de categoria com flyout (Sidebar.jsx) misturava a propriedade shorthand "font: inherit" com "fontSize"/"fontWeight" no mesmo objeto de estilo — o React acusava "Updating a style property during rerender (fontWeight) when a conflicting property is set (font)".',
      'Trocado "font: inherit" pelas propriedades longhand equivalentes ("fontFamily: inherit" + "lineHeight: inherit"), que não conflitam com fontSize/fontWeight já definidos explicitamente.',
      'Sem mudança visual ou de comportamento — só elimina o erro no console.',
    ],
  },
  {
    version: '1.18.0',
    date: '2026-07-08',
    title: 'Sidebar reorganizada em categorias com flyout',
    notes: [
      'A navegação lateral deixou de ser uma lista plana ("Ferramentas" / "Sistema") e passou a 4 categorias: Home (Dashboard), Observabilidade (MonitorsCreator, AuditMonitors, ScopeMaturity), Financeiro (FinOps Insights) e Sistema (Configurações, Sobre).',
      'Categorias com mais de um item abrem um pequeno flyout ao passar o mouse (desktop) para navegar entre os recursos, sem precisar entrar em cada um pra descobrir o que tem lá dentro; no mobile (sidebar off-canvas) o mesmo flyout vira uma lista que expande ao tocar, já que não há hover em touch.',
      'Categorias com um único item (Home, Financeiro) continuam navegando direto ao clicar — sem flyout, pois não há o que escolher.',
      'Nenhuma rota mudou de lugar (mesmos hrefs de antes); só a organização visual da sidebar foi alterada, então links e favoritos existentes continuam funcionando.',
    ],
  },
  {
    version: '1.17.1',
    date: '2026-07-08',
    title: 'Correção: chave "version" duplicada no package.json + patch de dependências',
    notes: [
      'package.json tinha a chave "version" duplicada ("1.17.0" e, logo abaixo, "1.15.0"). Em JSON isso é ambíguo — o Node/npm ficava com a última ("1.15.0"), então qualquer ferramenta que lê a versão pelo package.json (npm version, metadata de build, etc.) via um número desatualizado, enquanto a tela Sobre (que lê de app-version.js) já mostrava 1.17.0. Corrigido para uma única chave, "1.17.1".',
      'Adicionado "engines": {"node": ">=22"} — a partir da 2.110.0, @supabase/supabase-js deixou de suportar Node 20 (EOL em 30/04/2026). O CI já usa Node 22; isso só torna explícito o requisito e falha cedo (com mensagem clara) em vez de silenciosamente em runtime.',
      'Next.js 16.2.9 → 16.2.10 (backport de segurança, CVE-2026-23869, sem breaking changes).',
      'React e React DOM 19.2.4 → 19.2.7 (acumula patches de hardening de Server Components).',
      'eslint-config-next atualizado para 16.2.10 para acompanhar o Next. @supabase/supabase-js já estava na versão mais recente (2.110.1) — sem mudança.',
    ],
  },
  {
    version: '1.17.0',
    date: '2026-07-07',
    title: 'Múltiplas orgs Datadog por usuário (Supabase) + remoção do "Desconectar"',
    notes: [
      'As credenciais do Datadog deixam de viver em cookie httpOnly de sessão e passam a ser guardadas por usuário no Supabase, cifradas em repouso (AES-256-GCM) — ver scripts/supabase-schema.sql e a seção "Múltiplas orgs" no README.',
      'Cada usuário pode salvar quantas orgs quiser (nome, site, API/App Key) e alternar entre elas com um clique ("Usar esta org"), sem digitar as chaves de novo.',
      'Novo card "Conexões Datadog" (Configurações e Step 1 do wizard) substitui o antigo card de sessão única; removido o botão "Desconectar" — agora a ação equivalente é remover a org da lista, não desconectar a sessão inteira.',
      'Novas rotas: GET/POST /api/connections e PATCH/DELETE /api/connections/:id. A rota /api/datadog/validate ganhou um POST para testar chaves antes de salvar.',
      'lib/session-keys.js mantém a mesma assinatura (readSessionKeys → {apiKey, appKey, site}) para não exigir mudanças nas rotas /api/datadog/* já existentes — por baixo, agora resolve a org ATIVA do usuário logado.',
    ],
  },
  {
    version: '1.16.1',
    date: '2026-07-07',
    title: 'Correção: layout mobile responsivo perdido em deploy anterior',
    notes: [
      'O deploy da 1.16.0 foi publicado a partir de uma base de AppShell/Sidebar/Icons desatualizada e, com isso, perdeu o menu mobile (hamburger, sidebar off-canvas, overlay) e a paleta de cores da sidebar que já existiam em versões locais mais recentes.',
      'Restaurado: AppShell.js e Sidebar.jsx voltam a suportar o menu off-canvas em telas ≤768px (IconMenu/IconClose, classes .app-shell/.app-sidebar/.mobile-topbar/.sidebar-overlay em globals.css).',
      'Restaurada a paleta da sidebar (roxo mais escuro) e o breakpoint de tablet (≤1024px).',
      'Sem mudanças de funcionalidade nas ferramentas (AuditMonitors, ScopeMaturity, FinOps) — histórico de score e cobertura por host da 1.16.0 permanecem intactos.',
    ],
  },
  {
    version: '1.16.0',
    date: '2026-07-06',
    title: 'Histórico de scores (sparkline + delta) e auditoria por host',
    notes: [
      'Novo histórico de score (via Upstash Redis, fallback em memória): ScopeMaturity e AuditMonitors passam a mostrar um sparkline de tendência e um delta (▲/▼) desde a medição anterior. Um ponto por dia.',
      'AuditMonitors: cobertura de Infra por HOST — matriz host × métrica (✓/✗) com heurística de escopo da query ({*} cobre todos; host:<nome> cobre específico).',
      'Limpeza: removidos os órfãos analytics/monitors-analytics que sobraram na migração para AuditMonitors.',
    ],
  },
  {
    version: '1.15.0',
    date: '2026-07-06',
    title: 'MonitorsAnalytics vira AuditMonitors (análise de cobertura)',
    notes: [
      'MonitorsAnalytics renomeado para AuditMonitors (rota /ferramentas/audit, endpoint audit-monitors) e a função de score de maturidade foi aposentada.',
      'AuditMonitors analisa o ambiente (hosts + serviços APM + monitores) e mostra quais métricas-chave têm monitor e quais estão sem cobertura — detecção por nome de métrica na query do monitor.',
      'Catálogo Infra (CPU, memória, disco, I/O, rede, load, Agent Down) + APM (latência, erros, throughput). Botão "Criar os que faltam" gera os monitores de Infra em lacuna reaproveitando a rota infra-monitors (idempotente).',
      'Dashboard e Sobre atualizados; testes para a lib de auditoria.',
    ],
  },
  {
    version: '1.14.0',
    date: '2026-07-06',
    title: 'ScopeMaturity em 5 pilares + níveis, kube_namespace e histórico resumido',
    notes: [
      'ScopeMaturity reorganizado nos 5 pilares de maturidade (Cobertura, Qualidade dos Monitores, Observabilidade, Processos, Governança), cada um com a meta "maduro" e as dimensões que o compõem.',
      'Novo pilar Observabilidade: detecta quais sinais estão ativos (Métricas, Logs, APM, RUM, Synthetics, Profiling, DBM) via métricas datadog.estimated_usage.*.',
      'ScopeMaturity agora exibe o Nível de maturidade (1 a 5) por faixa de score: N1 0-20, N2 20-40, N3 40-60, N4 60-80, N5 80-100.',
      'Group By de serviços passou a incluir kube_namespace.',
      'Histórico (página Sobre) em formato resumido: versão + título, com as notas em expander.',
    ],
  },
  {
    version: '1.13.0',
    date: '2026-07-06',
    title: 'Monitores de Infra + correção de lint e testes',
    notes: [
      'Nova frente de descoberta de HOSTS e criação de monitores de infraestrutura (CPU, memória, disco, I/O, rede, load, Agent Down), com modo threshold ou anomaly por métrica.',
      'Correção: aspas cruas nos labels de DiscoveryConfigureInfra.jsx (react/no-unescaped-entities) que estavam quebrando o CI.',
      'Testes automatizados para lib/infra.js (query threshold/anomaly, by por termo na rede, service check do Agent Down, preview).',
    ],
  },
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
