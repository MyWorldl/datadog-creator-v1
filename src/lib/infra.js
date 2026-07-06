// src/lib/infra.js
//
// Fluxo de descoberta de HOSTS -> monitores de infraestrutura (CPU/Memória/
// Disco/Rede/I-O/Load/Agent). Espelha o padrão de src/lib/discovery.js:
// fonte única de query/payload, usada tanto no preview do cliente quanto na
// rota /api/datadog/infra-monitors, evitando lógica duplicada.
//
// Dois "tipos" de item em INFRA_TYPES (campo `kind`):
//   - kind:'metric' -> monitor de métrica. Pode ser criado como:
//       'threshold' (type "metric alert"): compara a média da janela contra
//         critical/warning. Bom para limites operacionais conhecidos.
//       'anomaly'   (type "query alert" com anomalies(...)): mesmo motor
//         usado nos monitores de serviço. Bom quando o "normal" varia por
//         host/dia.
//   - kind:'check'  -> monitor de SERVICE CHECK (type "service check").
//       Não compara um valor numérico: conta quantos dos últimos N reportes
//       de um check vieram com status crítico/warning/ok. Usado aqui para
//       "Agent Down" (check datadog.agent.up) — mais direto que depender de
//       notify_no_data numa métrica, porque reage ao PRÓPRIO sinal de
//       heartbeat do Agent, não a um efeito colateral de falta de métrica.
//       Doc: https://docs.datadoghq.com/api/latest/monitors/ (query de
//       service check) e https://docs.datadoghq.com/monitors/types/host/
//
// IMPORTANTE sobre nomes de métrica: os nomes abaixo assumem o Datadog Agent
// padrão (integração "system"). Se os hosts vierem de uma integração cloud
// pura (sem Agent, ex.: só CloudWatch), os nomes mudam
// (ex.: aws.ec2.cpuutilization). Ajuste INFRA_TYPES[].metric conforme a
// origem real dos seus hosts.

export const INFRA_TYPES = [
  {
    key: 'cpu', kind: 'metric', label: 'CPU', unit: '%',
    // 100 - idle = uso total de CPU.
    metric: (scope, by = '') => `100 - avg:system.cpu.idle{${scope}}${by}`,
    defThresholds: { critical: 90, warning: 80 },
    defDeviations: 3,
    hint: 'Uso de CPU acima do limite (ou fora do padrão histórico).',
    message: '🔴 [Infra · CPU] {{host.name}} — CPU em {{value}}% (limite: {{threshold}}%).\n@equipe-infra',
  },
  {
    key: 'memory', kind: 'metric', label: 'Memória', unit: '%',
    // pct_usable = fração LIVRE (0-1). Uso% = (1 - pct_usable) * 100.
    metric: (scope, by = '') => `100 - (avg:system.mem.pct_usable{${scope}}${by} * 100)`,
    defThresholds: { critical: 90, warning: 80 },
    defDeviations: 3,
    hint: 'Uso de memória acima do limite (ou fora do padrão histórico).',
    message: '🔴 [Infra · Memória] {{host.name}} — memória em {{value}}% (limite: {{threshold}}%).\n@equipe-infra',
  },
  {
    key: 'disk', kind: 'metric', label: 'Disco (espaço)', unit: '%',
    // in_use já vem como fração 0-1 por device -> agrega por host+device.
    metric: (scope, by = '') => `avg:system.disk.in_use{${scope}}${by} * 100`,
    defThresholds: { critical: 90, warning: 85 },
    defDeviations: 3,
    hint: 'Uso de espaço em disco acima do limite (ou fora do padrão histórico).',
    extraBy: ['device'], // disco quase sempre precisa de {host,device}
    message: '🔴 [Infra · Disco] {{host.name}} — disco em {{value}}% (limite: {{threshold}}%).\n@equipe-infra',
  },
  {
    key: 'diskIO', kind: 'metric', label: 'Disco · I/O (saturação)', unit: '%',
    // system.io.util = % do tempo em que o device esteve ocupado com I/O.
    // Mede SATURAÇÃO (gargalo de leitura/escrita), diferente de "disk" acima
    // (que mede espaço ocupado). Requer o check "disk" do Agent habilitado.
    metric: (scope, by = '') => `avg:system.io.util{${scope}}${by}`,
    defThresholds: { critical: 90, warning: 75 },
    defDeviations: 3,
    hint: 'Percentual de tempo com o disco ocupado em operações de I/O (gargalo de leitura/escrita, não é espaço livre).',
    extraBy: ['device'],
    message: '🔴 [Infra · Disco I/O] {{host.name}} — I/O em {{value}}% (limite: {{threshold}}%). Possível gargalo de leitura/escrita.\n@equipe-infra',
  },
  {
    key: 'network', kind: 'metric', label: 'Rede (erros)', unit: 'erros',
    // Soma de erros de pacote em ambas as direções, por host+interface.
    // .as_count() porque estamos somando ocorrências na janela, não uma taxa.
    // IMPORTANTE: é uma expressão com DOIS termos — o `by {...}` precisa
    // entrar em cada termo (não só no final), por isso este metric() aceita
    // o parâmetro `by` diretamente, diferente dos outros tipos acima.
    metric: (scope, by = '') => `sum:system.net.packets_in.error{${scope}}${by}.as_count() + sum:system.net.packets_out.error{${scope}}${by}.as_count()`,
    defThresholds: { critical: 50, warning: 10 },
    defDeviations: 3,
    hint: 'Pacotes de rede com erro (entrada+saída) na janela — indica problema de interface/driver/cabo, não uso normal de banda.',
    extraBy: ['device'], // interface de rede
    message: '🔴 [Infra · Rede] {{host.name}} — {{value}} erro(s) de pacote na janela (limite: {{threshold}}).\n@equipe-infra',
  },
  {
    key: 'load', kind: 'metric', label: 'Load Average (normalizado)', unit: 'x',
    // system.load.norm.5 = load média de 5min ÷ nº de CPUs. >1 significa mais
    // processos prontos para rodar do que núcleos disponíveis.
    metric: (scope, by = '') => `avg:system.load.norm.5{${scope}}${by}`,
    defThresholds: { critical: 2, warning: 1 },
    defDeviations: 3,
    hint: 'Load average de 5min dividido pelo nº de CPUs. Acima de 1x, há mais processos esperando CPU do que núcleos disponíveis.',
    message: '🔴 [Infra · Load] {{host.name}} — load normalizado em {{value}}x (limite: {{threshold}}x).\n@equipe-infra',
  },
  {
    key: 'hostUp', kind: 'check', label: 'Agent Down (sem reporte)', unit: '',
    // Service check nativo do Agent: reporta a cada ~15s. Não é métrica —
    // não tem "mode" threshold/anomaly nem unidade; o payload é construído
    // à parte em buildHostCheckMonitorPayload.
    check: 'datadog.agent.up',
    defCounts: { critical: 3, warning: 1 }, // nº de reportes "down" nos últimos `window` para disparar
    defWindow: 4, // últimos N reportes do check considerados
    hint: 'Alerta quando o Agent do host para de enviar heartbeat (crash, host desligado, rede caiu) — reage ao check em si, não a uma métrica ausente.',
    message: '🔴 [Infra · Agent Down] {{host.name}} — o Agent parou de reportar.\n@equipe-infra',
  },
]
export const INFRA_BY_KEY = Object.fromEntries(INFRA_TYPES.map(t => [t.key, t]))
export const DEFAULT_INFRA_GROUP_BY = ['host']

export function initialInfraDiscovery() {
  return {
    hosts: [],       // nomes descobertos
    selected: {},    // { host: true }  (seleção simples, sem operations)
    metrics: Object.fromEntries(
      INFRA_TYPES.map(t => {
        if (t.kind === 'check') {
          return [t.key, {
            enabled: false,
            mode: 'check',
            counts: { ...t.defCounts },
            window: t.defWindow,
            renotifyMinutes: 60,
          }]
        }
        return [t.key, {
          enabled: t.key === 'cpu' || t.key === 'memory',
          mode: 'threshold',            // 'threshold' | 'anomaly'
          thresholds: { ...t.defThresholds },
          deviations: t.defDeviations,
          direction: 'above',
          algorithm: 'robust',
          seasonality: 'weekly',
          queryWindow: 'last_10m',
          alertWindow: 'last_15m',
          noDataMinutes: 10,
          renotifyMinutes: 60,
          evaluationDelay: 0,
        }]
      })
    ),
    groupBy: [...DEFAULT_INFRA_GROUP_BY],
    messages: Object.fromEntries(INFRA_TYPES.map(t => [t.key, t.message])),
    namePrefix: '[MonitorsCreator]',
    tags: [],
  }
}

// ── Construção de query/payload (fonte única) ──
function scopeOf(host, extraTags) {
  const parts = [`host:${host}`]
  for (const t of (extraTags || [])) if (t) parts.push(t)
  return parts.join(',')
}
function byClauseOf(groupBy) {
  const g = (groupBy || []).filter(Boolean)
  return g.length ? ` by {${g.join(',')}}` : ''
}

export function buildInfraQuery({ kind, host, extraTags, groupBy, mode, thresholds, deviations, direction = 'above', algorithm = 'robust', seasonality = 'weekly', queryWindow = 'last_10m', alertWindow = 'last_15m' }) {
  const t = INFRA_BY_KEY[kind]
  const scope = scopeOf(host, extraTags)
  const by = byClauseOf([...(groupBy || ['host']), ...(t.extraBy || [])])
  // `by` é passado PARA DENTRO de metric() (não concatenado depois) porque
  // expressões com mais de um termo (ex.: "network", soma de duas métricas)
  // precisam do `by {...}` em cada termo — colado só no final, o Datadog
  // aplicaria o group-by apenas ao último termo da expressão.
  const m = t.metric(scope, by)

  if (mode === 'anomaly') {
    const seas = algorithm !== 'basic' ? `, seasonality='${seasonality}'` : ''
    return `avg(${queryWindow}):anomalies(${m}, '${algorithm}', ${deviations}, direction='${direction}', alert_window='${alertWindow}', interval=60, count_default_zero='true'${seas}) >= 1`
  }
  // threshold simples: type "metric alert" exige o valor de "critical" na
  // própria query (options.thresholds.critical deve bater com esse valor).
  return `avg(${queryWindow}):${m} > ${thresholds.critical}`
}

function buildMetricInfraMonitorPayload({ kind, host, extraTags, groupBy, mode, thresholds, deviations, direction, algorithm, seasonality, queryWindow, alertWindow, message, tags, namePrefix, noDataMinutes = 10, renotifyMinutes = 60, evaluationDelay }) {
  const t = INFRA_BY_KEY[kind]
  const name = `${(namePrefix || '[MonitorsCreator]').trim()} ${host} · Infra · ${t.label}`.trim()

  const baseTags = ['created_by:monitorscreator', `host:${host}`, `infra_metric:${kind}`]
  for (const tg of (tags || [])) if (tg && !baseTags.includes(tg)) baseTags.push(tg)

  return {
    name,
    type: 'query alert',
    query: buildInfraQuery({ kind, host, extraTags, groupBy, mode, thresholds, deviations, direction, algorithm, seasonality, queryWindow, alertWindow }),
    message: message || t.message,
    tags: baseTags,
    options: {
      thresholds: mode === 'anomaly'
        ? { critical: 1.0 }
        : { critical: thresholds.critical, warning: thresholds.warning },
      ...(mode === 'anomaly' ? {
        threshold_windows: { trigger_window: alertWindow || 'last_15m', recovery_window: alertWindow || 'last_15m' },
      } : {}),
      // Host sem dados é o próprio incidente (crash, agent parado, rede
      // caiu) — diferente do monitor de serviço, aqui isso PRECISA alertar.
      notify_no_data: true,
      no_data_timeframe: noDataMinutes,
      // Re-notifica enquanto o problema persiste, para não ser esquecido.
      renotify_interval: renotifyMinutes,
      // Métricas de integrações cloud costumam chegar atrasadas; evita
      // falso "sem dados" ou leitura de janela incompleta.
      ...(evaluationDelay ? { evaluation_delay: evaluationDelay } : {}),
      notify_audit: false,
      require_full_window: false,
    },
  }
}

// ── Service check (Agent Down) ──
// Sintaxe de monitor de service check:
//   "<check_name>".over("host:<host>", ...).by("host").last(<window>).count_by_status()
// options.thresholds usa {critical,warning,ok} = nº de reportes com aquele
// status, dentro da janela `last(window)`, necessário para disparar.
// Doc: https://docs.datadoghq.com/monitors/types/host/ e
// https://docs.datadoghq.com/api/latest/monitors/#create-a-monitor
function buildHostCheckQuery({ host, extraTags, check, window = 4 }) {
  const scope = scopeOf(host, extraTags)
  const over = scope.split(',').map(s => `"${s}"`).join(', ')
  return `"${check}".over(${over}).by("host").last(${window}).count_by_status()`
}

function buildHostCheckMonitorPayload({ kind, host, extraTags, counts, window, message, tags, namePrefix, renotifyMinutes = 60 }) {
  const t = INFRA_BY_KEY[kind]
  const name = `${(namePrefix || '[MonitorsCreator]').trim()} ${host} · Infra · ${t.label}`.trim()

  const baseTags = ['created_by:monitorscreator', `host:${host}`, `infra_metric:${kind}`]
  for (const tg of (tags || [])) if (tg && !baseTags.includes(tg)) baseTags.push(tg)

  return {
    name,
    type: 'service check',
    query: buildHostCheckQuery({ host, extraTags, check: t.check, window: window || t.defWindow }),
    message: message || t.message,
    tags: baseTags,
    options: {
      thresholds: { critical: counts?.critical ?? t.defCounts.critical, warning: counts?.warning ?? t.defCounts.warning, ok: counts?.ok ?? 1 },
      // O próprio check "sem reportar mais nada" já é coberto por
      // notify_no_data aqui — diferente das métricas, faz sentido manter
      // ligado, pois um Agent totalmente sumido também deve alertar.
      notify_no_data: true,
      no_data_timeframe: (window || t.defWindow) * 2,
      renotify_interval: renotifyMinutes,
      notify_audit: false,
    },
  }
}

// Dispatcher único usado pelo preview e pela rota de criação — decide entre
// o payload de métrica e o de service check conforme INFRA_BY_KEY[kind].kind.
export function buildInfraMonitorPayload(args) {
  const t = INFRA_BY_KEY[args.kind]
  return t?.kind === 'check' ? buildHostCheckMonitorPayload(args) : buildMetricInfraMonitorPayload(args)
}

// Expande o estado de descoberta de infra em uma lista de monitores
// previstos. Um monitor por (host selecionado × métrica habilitada).
export function planInfraPreview(infraDiscovery) {
  const d = infraDiscovery || {}
  const { selected = {}, metrics = {}, groupBy = DEFAULT_INFRA_GROUP_BY, tags = [], namePrefix = '[MonitorsCreator]', messages = {} } = d
  const hosts = Object.keys(selected).filter(h => selected[h])

  const plan = []
  for (const host of hosts) {
    for (const t of INFRA_TYPES) {
      const cfg = metrics[t.key]
      if (!cfg?.enabled) continue

      const payload = t.kind === 'check'
        ? buildInfraMonitorPayload({
            kind: t.key, host, tags, namePrefix, message: messages[t.key],
            counts: cfg.counts || t.defCounts,
            window: cfg.window || t.defWindow,
            renotifyMinutes: cfg.renotifyMinutes,
          })
        : buildInfraMonitorPayload({
            kind: t.key, host, groupBy, tags, namePrefix, message: messages[t.key],
            mode: cfg.mode || 'threshold',
            thresholds: cfg.thresholds || t.defThresholds,
            deviations: cfg.deviations || t.defDeviations,
            direction: cfg.direction || 'above',
            algorithm: cfg.algorithm || 'robust',
            seasonality: cfg.seasonality || 'weekly',
            queryWindow: cfg.queryWindow || 'last_10m',
            alertWindow: cfg.alertWindow || 'last_15m',
            noDataMinutes: cfg.noDataMinutes,
            renotifyMinutes: cfg.renotifyMinutes,
            evaluationDelay: cfg.evaluationDelay,
          })
      plan.push({ kind: t.key, label: t.label, service: host, operation: t.label, name: payload.name, query: payload.query, message: payload.message, payload })
    }
  }
  return plan
}
