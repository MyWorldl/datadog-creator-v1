// src/lib/infra.ts
//
// Fluxo de descoberta de HOSTS -> monitores de infraestrutura (CPU/Memória/
// Disco/Rede/I-O/Load/Agent). Espelha o padrão de src/lib/discovery.ts:
// fonte única de query/payload, usada tanto no preview do cliente quanto na
// rota /api/datadog/infra-monitors, evitando lógica duplicada.
//
// Dois "tipos" de item em INFRA_TYPES (campo `kind`):
//   - kind:'metric' -> monitor de métrica. Pode ser criado como:
//       'threshold' (type "query alert", não "metric alert" — a query sempre
//         tem `by {host,...}`, e "metric alert" é reservado a série única sem
//         group-by): compara a média da janela contra critical/warning. Bom
//         para limites operacionais conhecidos.
//       'anomaly'   (type "query alert" com anomalies(...)): mesmo motor
//         usado nos monitores de serviço. Bom quando o "normal" varia por
//         host/dia.
//       'outlier'   (type "query alert" com outliers(...), atrás da feature
//         flag outlierDetection — ver lib/feature-flags.ts): DIFERENTE dos
//         outros dois modos — não é 1 monitor por host, é 1 monitor pro
//         GRUPO INTEIRO de hosts selecionados, que compara os hosts ENTRE SI
//         e aponta qual deles foge do padrão do grupo (bom pra achar "a
//         ovelha negra" num cluster/role, sem precisar de threshold fixo
//         nem de histórico por host). Por isso o `host` vira `host[]` nesse
//         modo e a expansão do plano (planInfraPreview) trata outlier num
//         loop à parte do loop por-host normal.
//         Sintaxe confirmada na doc (dashboards/functions/algorithms):
//         outliers(<query>, '<algoritmo>', <tolerância>[, <percentual>]) —
//         percentual só existe pros algoritmos MAD/scaledMAD. options do
//         payload seguem o mesmo padrão de anomaly (thresholds.critical:1,
//         sem threshold_windows — esse campo é específico de anomaly/
//         alert_window, não documentado pra outlier).
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

import type { FeatureFlag } from './feature-flags'

export type InfraKind = 'cpu' | 'memory' | 'disk' | 'diskIO' | 'network' | 'load' | 'hostUp'
  | 'k8sNodeReady' | 'dbConnections' | 'dbReplication' | 'dbQueryHealth'
export type InfraMode = 'threshold' | 'anomaly' | 'outlier' | 'check'
export type OutlierAlgorithm = 'DBSCAN' | 'MAD' | 'scaledDBSCAN' | 'scaledMAD'
// Engine do banco por trás das métricas dbConnections/dbReplication/
// dbQueryHealth — nomes de métrica (e, pra conexões, a fórmula) diferem entre
// Postgres e MySQL, e o app não descobre sozinho qual engine roda em cada
// host, então é o usuário quem escolhe (mesmo espírito do `algorithm` em
// anomaly/outlier: um campo por tipo, não uma etapa de descoberta nova).
export type DbEngine = 'postgres' | 'mysql'

export interface InfraThresholds {
  critical: number
  warning: number
}

export interface InfraCounts {
  critical: number
  warning: number
  ok?: number
}

interface InfraTypeBase {
  key: InfraKind
  label: string
  unit: string
  hint: string
  message: string
  // Flag que precisa estar ligada pra este tipo aparecer na lista (K8s/DBM
  // ficam atrás de k8sDbmCoverage, mesmo padrão do badge "PREVIEW" do outlier).
  flag?: FeatureFlag
}

export interface InfraMetricType extends InfraTypeBase {
  kind: 'metric'
  metric: (scope: string, by?: string, engine?: DbEngine) => string
  defThresholds: InfraThresholds
  defDeviations: number
  extraBy?: string[]
  // 'below' inverte o comparador do modo threshold (usa `<` em vez de `>`)
  // pra métricas onde o valor RUIM é baixo (ex.: node schedulable = 0/1,
  // queremos alertar quando cai abaixo de 1). Default (ausente) = 'above',
  // preservando o comportamento de todas as métricas já existentes.
  thresholdDirection?: 'above' | 'below'
  // Só as métricas de banco (dbConnections/dbReplication/dbQueryHealth) usam
  // engine — presença deste campo é o que a UI usa pra mostrar o seletor.
  requiresEngine?: boolean
  // Agregador de JANELA no modo threshold (avg(window):.../sum(window):...).
  // Default ausente = 'avg' (preserva o comportamento de sempre). Só faz
  // diferença pra métricas cuja fórmula usa .as_count() (network,
  // dbQueryHealth): a regra do Datadog "use sum, não avg, com .as_count()" é
  // sobre o agregador ESPACIAL (sum:metric{...}, que essas fórmulas já usam
  // corretamente) — não sobre este agregador externo, então avg() não é uma
  // query inválida. Mas semanticamente, avg(window) sobre uma métrica de
  // CONTAGEM por intervalo devolve a média de ocorrências por intervalo,
  // enquanto a mensagem desses monitores promete um TOTAL "na janela" — daí
  // 'sum' nesses dois tipos, pra bater cálculo com o que o texto promete
  // (achado da auditoria). Não mexe em anomaly/outlier (outro modo, outra
  // semântica — lá avg() externo é o padrão correto e documentado, mesmo com
  // .as_count() dentro, como em discovery.ts/highVolume).
  windowAgg?: 'avg' | 'sum'
  // no_data_timeframe (minutos) pra esse tipo — default ausente = 10 (mesmo
  // de sempre, ver buildMetricInfraMonitorPayload). Só usado hoje por
  // k8sNodeReady, onde o notify_no_data É o mecanismo real de disparo (ver
  // comentário no type) — um valor mais curto que o padrão genérico de 10min
  // faz sentido especificamente ali.
  defNoDataMinutes?: number
}

interface InfraCheckType extends InfraTypeBase {
  kind: 'check'
  check: string
  defCounts: InfraCounts
  defWindow: number
}

export type InfraType = InfraMetricType | InfraCheckType

export const INFRA_TYPES: InfraType[] = [
  {
    key: 'cpu', kind: 'metric', label: 'CPU', unit: '%',
    // 100 - idle = uso total de CPU.
    metric: (scope, by = '') => `100 - avg:system.cpu.idle{${scope}}${by}`,
    defThresholds: { critical: 90, warning: 80 },
    defDeviations: 3,
    hint: 'Uso de CPU acima do limite (ou fora do padrão histórico).',
    message: `{{#is_alert}}🔴 [Infra · CPU] {{host.name}} — CPU em {{value}}% (crítico: {{threshold}}%).{{/is_alert}}{{#is_warning}}🟡 [Infra · CPU] {{host.name}} — CPU em {{value}}% (warning: {{warn_threshold}}%).{{/is_warning}}{{#is_alert_recovery}}✅ [Infra · CPU] {{host.name}} — CPU voltou ao normal ({{value}}%, abaixo do limite).{{/is_alert_recovery}}{{#is_warning_recovery}}✅ [Infra · CPU] {{host.name}} — CPU voltou ao normal ({{value}}%, abaixo do limite).{{/is_warning_recovery}}{{#is_no_data}}⚪ [Infra · CPU] {{host.name}} — sem dados recentes.{{/is_no_data}}

**O que monitora:** percentual de uso de CPU do host em relação à capacidade total, dentro da janela avaliada. Dispara quando o valor ultrapassa o limite configurado.

**Por que importa:** uso sustentado próximo do limite reduz a margem de capacidade, aumenta a latência de processos e pode causar degradação de serviços, throttling em containers ou queda de processos críticos.

**Causas prováveis:**
- Pico de tráfego ou carga de trabalho acima do normal
- Processo com uso ineficiente de CPU (loop, leak, query pesada)
- Job em lote (batch) ou cron mal dimensionado no host
- Redução no número de instâncias/hosts do pool, concentrando carga
- Ruído de vizinhança em ambientes compartilhados (noisy neighbor)

**Ação recomendada:** identificar os processos com maior consumo (top/htop, APM), verificar correlação com aumento de tráfego, avaliar escalonamento horizontal/vertical e checar jobs concorrentes que possam ser reagendados.

@equipe-infra`,
  },
  {
    key: 'memory', kind: 'metric', label: 'Memória', unit: '%',
    // pct_usable = fração LIVRE (0-1). Uso% = (1 - pct_usable) * 100.
    metric: (scope, by = '') => `100 - (avg:system.mem.pct_usable{${scope}}${by} * 100)`,
    defThresholds: { critical: 90, warning: 80 },
    defDeviations: 3,
    hint: 'Uso de memória acima do limite (ou fora do padrão histórico).',
    message: `{{#is_alert}}🔴 [Infra · Memória] {{host.name}} — memória em {{value}}% (crítico: {{threshold}}%).{{/is_alert}}{{#is_warning}}🟡 [Infra · Memória] {{host.name}} — memória em {{value}}% (warning: {{warn_threshold}}%).{{/is_warning}}{{#is_alert_recovery}}✅ [Infra · Memória] {{host.name}} — memória voltou ao normal ({{value}}%, abaixo do limite).{{/is_alert_recovery}}{{#is_warning_recovery}}✅ [Infra · Memória] {{host.name}} — memória voltou ao normal ({{value}}%, abaixo do limite).{{/is_warning_recovery}}{{#is_no_data}}⚪ [Infra · Memória] {{host.name}} — sem dados recentes.{{/is_no_data}}

**O que monitora:** percentual de uso de memória RAM do host em relação à capacidade total, alertando quando o consumo ultrapassa o limite configurado.

**Por que importa:** memória insuficiente pode causar uso excessivo de swap (degradando performance), OOM Killer encerrando processos abruptamente e falhas em cascata quando serviços dependentes não conseguem alocar memória.

**Causas prováveis:**
- Memory leak em alguma aplicação
- Aumento real de carga/volume de dados em memória (cache, buffers)
- Processo ou container sem limite de memória configurado corretamente
- Vazamento de conexões ou sessões não liberadas
- Redução no número de instâncias, concentrando carga de memória

**Ação recomendada:** analisar o histórico de consumo por processo, verificar se o crescimento é gradual (leak) ou súbito (pico de carga), revisar limites de memória de containers/processos e considerar reinício controlado ou scale out como mitigação imediata.

@equipe-infra`,
  },
  {
    key: 'disk', kind: 'metric', label: 'Disco (espaço)', unit: '%',
    // in_use já vem como fração 0-1 por device -> agrega por host+device.
    metric: (scope, by = '') => `avg:system.disk.in_use{${scope}}${by} * 100`,
    defThresholds: { critical: 90, warning: 85 },
    defDeviations: 3,
    hint: 'Uso de espaço em disco acima do limite (ou fora do padrão histórico).',
    extraBy: ['device'], // disco quase sempre precisa de {host,device}
    message: `{{#is_alert}}🔴 [Infra · Disco] {{host.name}} — disco em {{value}}% (crítico: {{threshold}}%).{{/is_alert}}{{#is_warning}}🟡 [Infra · Disco] {{host.name}} — disco em {{value}}% (warning: {{warn_threshold}}%).{{/is_warning}}{{#is_alert_recovery}}✅ [Infra · Disco] {{host.name}} — disco voltou ao normal ({{value}}%, abaixo do limite).{{/is_alert_recovery}}{{#is_warning_recovery}}✅ [Infra · Disco] {{host.name}} — disco voltou ao normal ({{value}}%, abaixo do limite).{{/is_warning_recovery}}{{#is_no_data}}⚪ [Infra · Disco] {{host.name}} — sem dados recentes.{{/is_no_data}}

**O que monitora:** percentual de espaço em disco utilizado em relação à capacidade total do volume/partição monitorada.

**Por que importa:** disco cheio é uma das causas mais comuns de indisponibilidade total: impede escrita de logs, trava banco de dados, impede gravação de arquivos temporários e pode deixar o sistema operacional instável.

**Causas prováveis:**
- Crescimento não controlado de logs de aplicação
- Acúmulo de arquivos temporários, dumps ou backups locais
- Crescimento orgânico de banco de dados sem rotação/retenção configurada
- Falha em job de limpeza (log rotation, cleanup automatizado)
- Aumento real de volume de dados armazenados pela aplicação

**Ação recomendada:** identificar diretórios/arquivos que mais consomem espaço, validar políticas de retenção e rotação de logs, remover arquivos temporários com segurança e avaliar expansão do volume caso o crescimento seja orgânico e esperado.

@equipe-infra`,
  },
  {
    key: 'diskIO', kind: 'metric', label: 'Disco · I/O (saturação)', unit: '%',
    // system.io.util = % do tempo em que o device esteve ocupado com I/O.
    // Mede SATURAÇÃO (gargalo de leitura/escrita), diferente de "disk" acima
    // (que mede espaço ocupado). Requer o check "disk" do Agent habilitado.
    // Confirmado na doc: métrica só Linux, não populada em hosts Windows
    // (achado da auditoria).
    metric: (scope, by = '') => `avg:system.io.util{${scope}}${by}`,
    defThresholds: { critical: 90, warning: 75 },
    defDeviations: 3,
    hint: 'Percentual de tempo com o disco ocupado em operações de I/O (gargalo de leitura/escrita, não é espaço livre). Só Linux — a métrica não é populada em hosts Windows.',
    extraBy: ['device'],
    message: `{{#is_alert}}🔴 [Infra · Disco I/O] {{host.name}} — I/O em {{value}}% (crítico: {{threshold}}%). Possível gargalo de leitura/escrita.{{/is_alert}}{{#is_warning}}🟡 [Infra · Disco I/O] {{host.name}} — I/O em {{value}}% (warning: {{warn_threshold}}%).{{/is_warning}}{{#is_alert_recovery}}✅ [Infra · Disco I/O] {{host.name}} — I/O voltou ao normal ({{value}}%, abaixo do limite).{{/is_alert_recovery}}{{#is_warning_recovery}}✅ [Infra · Disco I/O] {{host.name}} — I/O voltou ao normal ({{value}}%, abaixo do limite).{{/is_warning_recovery}}{{#is_no_data}}⚪ [Infra · Disco I/O] {{host.name}} — sem dados recentes.{{/is_no_data}}

**O que monitora:** percentual de utilização/saturação de I/O do disco (tempo em que o disco está ocupado processando leitura/escrita), sinalizando quando ultrapassa o limite.

**Por que importa:** saturação de I/O gera aumento de latência mesmo com CPU e memória saudáveis — é um gargalo silencioso que afeta bancos de dados, filas e persistência intensiva, podendo causar timeouts em cascata.

**Causas prováveis:**
- Consultas de banco de dados ineficientes (queries sem índice, table scans)
- Backup, restore ou replicação rodando em horário de pico
- Disco físico subdimensionado para a carga (ex.: HDD onde deveria haver SSD/NVMe)
- Múltiplos processos concorrendo pelo mesmo volume
- Escrita excessiva de logs em modo síncrono

**Ação recomendada:** verificar quais processos geram maior I/O, revisar queries e índices, mover cargas pesadas (backup/batch) para janelas de menor uso e considerar discos de maior performance ou separação de volumes por tipo de carga.

@equipe-infra`,
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
    windowAgg: 'sum', // total na janela, não média por intervalo — ver comentário no campo
    hint: 'Pacotes de rede com erro (entrada+saída) na janela — indica problema de interface/driver/cabo, não uso normal de banda.',
    extraBy: ['device'], // interface de rede
    message: `{{#is_alert}}🔴 [Infra · Rede] {{host.name}} — {{value}} erro(s) de pacote na janela (crítico: {{threshold}}).{{/is_alert}}{{#is_warning}}🟡 [Infra · Rede] {{host.name}} — {{value}} erro(s) de pacote na janela (warning: {{warn_threshold}}).{{/is_warning}}{{#is_alert_recovery}}✅ [Infra · Rede] {{host.name}} — erros de pacote voltaram ao normal ({{value}}, abaixo do limite).{{/is_alert_recovery}}{{#is_warning_recovery}}✅ [Infra · Rede] {{host.name}} — erros de pacote voltaram ao normal ({{value}}, abaixo do limite).{{/is_warning_recovery}}{{#is_no_data}}⚪ [Infra · Rede] {{host.name}} — sem dados recentes.{{/is_no_data}}

**O que monitora:** quantidade de erros de pacote (descartes, colisões, falhas de transmissão/recepção) na interface de rede do host dentro da janela, comparado ao limite configurado.

**Por que importa:** erros de rede indicam problemas na camada de transporte que podem causar retransmissões, aumento de latência, perda de conexões e indisponibilidade de comunicação — mesmo com CPU, memória e disco normais.

**Causas prováveis:**
- Problema físico de cabeamento, placa de rede ou switch
- Configuração incorreta de MTU, duplex ou negociação de velocidade
- Sobrecarga de tráfego na interface (saturação de banda)
- Problema em equipamento de rede intermediário (firewall, load balancer)
- Falha de driver ou firmware da interface de rede

**Ação recomendada:** verificar estatísticas da interface (erros de entrada vs. saída, descartes), checar se o problema é isolado ao host ou afeta múltiplos hosts na mesma rede/rack, e acionar a equipe de rede caso indique problema físico ou de equipamento.

@equipe-infra`,
  },
  {
    key: 'load', kind: 'metric', label: 'Load Average (normalizado)', unit: 'x',
    // system.load.norm.5 = load média de 5min ÷ nº de CPUs. >1 significa mais
    // processos prontos para rodar do que núcleos disponíveis. Confirmado na
    // doc: métrica só Linux, não populada em hosts Windows (achado da auditoria).
    metric: (scope, by = '') => `avg:system.load.norm.5{${scope}}${by}`,
    defThresholds: { critical: 2, warning: 1 },
    defDeviations: 3,
    hint: 'Load average de 5min dividido pelo nº de CPUs. Acima de 1x, há mais processos esperando CPU do que núcleos disponíveis. Só Linux — a métrica não é populada em hosts Windows.',
    message: `{{#is_alert}}🔴 [Infra · Load] {{host.name}} — load normalizado em {{value}}x (crítico: {{threshold}}x).{{/is_alert}}{{#is_warning}}🟡 [Infra · Load] {{host.name}} — load normalizado em {{value}}x (warning: {{warn_threshold}}x).{{/is_warning}}{{#is_alert_recovery}}✅ [Infra · Load] {{host.name}} — load voltou ao normal ({{value}}x, abaixo do limite).{{/is_alert_recovery}}{{#is_warning_recovery}}✅ [Infra · Load] {{host.name}} — load voltou ao normal ({{value}}x, abaixo do limite).{{/is_warning_recovery}}{{#is_no_data}}⚪ [Infra · Load] {{host.name}} — sem dados recentes.{{/is_no_data}}

**O que monitora:** load average do host normalizado pelo número de núcleos de CPU, alertando quando ultrapassa o limite (1x = demanda igual à capacidade total de processamento).

**Por que importa:** load normalizado acima do limite indica mais processos aguardando CPU/recursos do que o host consegue atender simultaneamente — sinaliza saturação geral mesmo quando o uso percentual de CPU isolado não parece crítico (captura também espera por I/O).

**Causas prováveis:**
- Excesso de processos concorrentes para a capacidade do host
- Processos em espera por I/O (disco ou rede lentos) contribuindo para o load
- Dimensionamento inadequado do host para a carga atual
- Deadlocks ou processos travados acumulando na fila de execução

**Ação recomendada:** correlacionar com CPU, I/O de disco e memória para achar o gargalo real, verificar processos em estado "D" (uninterruptible sleep) e avaliar redimensionamento ou balanceamento de carga entre hosts.

@equipe-infra`,
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
    message: `{{#is_alert}}🔴 [Infra · Agent Down] {{host.name}} — o Agent parou de reportar.{{/is_alert}}{{#is_warning}}🟡 [Infra · Agent Down] {{host.name}} — reportes intermitentes do Agent.{{/is_warning}}{{#is_alert_recovery}}✅ [Infra · Agent Down] {{host.name}} — Agent voltou a reportar normalmente.{{/is_alert_recovery}}{{#is_warning_recovery}}✅ [Infra · Agent Down] {{host.name}} — Agent voltou a reportar normalmente.{{/is_warning_recovery}}{{#is_no_data}}⚪ [Infra · Agent Down] {{host.name}} — sem dados recentes do check.{{/is_no_data}}

**O que monitora:** se o agente de monitoramento do host está reportando métricas dentro do intervalo esperado. Dispara quando o host para de enviar dados.

**Por que importa:** sem o agente reportando, o time perde toda a observabilidade daquele host — não é possível saber se há problema de CPU, memória, disco ou rede, o que pode mascarar outro incidente ocorrendo simultaneamente.

**Causas prováveis:**
- Host desligado, reiniciado ou em manutenção
- Falha ou crash do processo do agente
- Perda de conectividade de rede entre o host e a plataforma
- Host removido/desprovisionado sem remoção do monitor correspondente
- Problema de autenticação/certificado do agente

**Ação recomendada:** confirmar se a ausência de reporte é esperada (manutenção, desprovisionamento); se não for, verificar acesso via SSH/console, status do processo do agente, logs e conectividade de rede.

@equipe-infra`,
  },
  {
    key: 'k8sNodeReady', kind: 'metric', label: 'K8s · Node Ready', unit: '',
    // ACHADO CRÍTICO DA AUDITORIA: a métrica usada aqui antes,
    // kubernetes_state.node.status{status:schedulable}, mede SCHEDULABILITY
    // (spec.unschedulable, resultado de um "kubectl cordon" manual) — não a
    // condição Ready/NotReady do Kubernetes. São dois campos independentes do
    // objeto Node: um node pode ficar NotReady (kubelet travado, sem rede,
    // DiskPressure) e continuar schedulable=1 normalmente, porque nada marca
    // unschedulable automaticamente quando o node quebra. Ou seja: o monitor
    // antigo nunca disparava no cenário real que deveria pegar.
    // Métrica certa: kubernetes_state.node.by_condition (SINGULAR — a versão
    // PLURAL, kubernetes_state.nodes.by_condition, é agregada cluster-wide de
    // propósito e não carrega tag de node/host nenhuma, escopar por host nela
    // não retorna nada). Confirmado via código-fonte do check kubernetes_state
    // (DataDog/integrations-core): só é emitida 1 linha por node por scrape —
    // a que tem valor 1 — então a série condition:ready,status:false aparece
    // de fato (e só) quando o node está NotReady, e SOME quando ele volta a
    // Ready. Por isso a query dispara direto no `> 0` (sem precisar de
    // notify_no_data como mecanismo primário, diferente do design anterior) —
    // notify_no_data continua ligado só como rede de segurança genérica
    // (mesmo padrão dos outros tipos), não mais como gatilho principal.
    // Tag de host: a métrica não tem uma tag `host` literal nos labels crus,
    // mas o check resolve o hostname Datadog a partir da tag `node` via
    // hostname_override (default da integração) — o mesmo mecanismo que já
    // sustenta host:<host> nos outros tipos K8s daqui. Confiança forte por
    // leitura de código-fonte, não testado contra um cluster real (não é
    // possível neste ambiente) — vale validar no Metrics Explorer antes de
    // confiar 100% em produção.
    metric: (scope, by = '') => `avg:kubernetes_state.node.by_condition{${scope},condition:ready,status:false}${by}`,
    // critical/warning:0 -> query vira "> 0": dispara assim que a série
    // (valor sempre 1 quando existe) aparece na janela. Não é "0 problemas
    // tolerados" no sentido usual — é o valor que faz `>` disparar numa
    // métrica que só existe como 1-ou-ausente (nunca fracionária).
    defThresholds: { critical: 0, warning: 0 },
    defDeviations: 3,
    flag: 'k8sDbmCoverage',
    hint: 'Alerta quando a condição Ready do node do Kubernetes fica false (NotReady) — ex.: kubelet travado, falha de rede, pressão de disco/memória. Requer Cluster Agent.',
    message: `{{#is_alert}}🔴 [Infra · K8s Node Ready] {{host.name}} — node NotReady (condição Ready = false).{{/is_alert}}{{#is_alert_recovery}}✅ [Infra · K8s Node Ready] {{host.name}} — node voltou a Ready.{{/is_alert_recovery}}{{#is_no_data}}⚪ [Infra · K8s Node Ready] {{host.name}} — sem dados recentes do Cluster Agent pra esse node.{{/is_no_data}}

**O que monitora:** a condição \`Ready\` do node do Kubernetes, reportada pelo kubelet ao control plane. Dispara quando o node fica NotReady.

**Por que importa:** um node NotReady deixa de receber novos pods (o scheduler evita agendá-lo ali) e, dependendo da causa e do tempo parado, o control plane pode despejar (evict) os pods já rodando nele — reduzindo a capacidade do cluster e podendo causar indisponibilidade se não houver capacidade sobrando em outros nodes.

**Causas prováveis:**
- Kubelet travado, sem recursos pra responder ou crashado
- Pressão de disco/memória no node (DiskPressure/MemoryPressure)
- Falha de rede entre o node e o control plane
- Falha no runtime de containers (containerd/CRI-O travado ou crashado)
- Node sendo substituído/reciclado pelo autoscaler

**Ação recomendada:** rodar "kubectl describe node" pra ver a condição e a mensagem exata reportada pelo kubelet, confirmar se é uma substituição esperada do autoscaler, e checar status do kubelet/containerd e conectividade com o control plane caso não seja.

@equipe-infra`,
  },
  {
    key: 'dbConnections', kind: 'metric', label: 'DBM · Conexões (%)', unit: '%',
    // Postgres já expõe um percentual pronto (0-1). MySQL não tem essa métrica
    // pronta — calculamos como threads_connected / max_connections_available,
    // normalizando os dois engines pra mesma escala 0-100%.
    metric: (scope, by = '', engine = 'postgres') => engine === 'mysql'
      ? `(avg:mysql.performance.threads_connected{${scope}}${by} / avg:mysql.net.max_connections_available{${scope}}${by}) * 100`
      : `avg:postgresql.percent_usage_connections{${scope}}${by} * 100`,
    defThresholds: { critical: 90, warning: 80 },
    defDeviations: 3,
    requiresEngine: true,
    flag: 'k8sDbmCoverage',
    hint: 'Percentual de conexões em uso em relação ao limite máximo do banco (Postgres ou MySQL, escolha o engine ao lado).',
    message: `{{#is_alert}}🔴 [DBM · Conexões] {{host.name}} — conexões em {{value}}% (crítico: {{threshold}}%).{{/is_alert}}{{#is_warning}}🟡 [DBM · Conexões] {{host.name}} — conexões em {{value}}% (warning: {{warn_threshold}}%).{{/is_warning}}{{#is_alert_recovery}}✅ [DBM · Conexões] {{host.name}} — conexões voltaram ao normal ({{value}}%, abaixo do limite).{{/is_alert_recovery}}{{#is_warning_recovery}}✅ [DBM · Conexões] {{host.name}} — conexões voltaram ao normal ({{value}}%, abaixo do limite).{{/is_warning_recovery}}{{#is_no_data}}⚪ [DBM · Conexões] {{host.name}} — sem dados recentes.{{/is_no_data}}

**O que monitora:** percentual de conexões ativas no banco de dados em relação ao limite máximo configurado (max_connections).

**Por que importa:** ao esgotar o limite de conexões, novas conexões da aplicação passam a falhar imediatamente — um dos jeitos mais comuns de causar indisponibilidade total mesmo com o banco saudável em CPU/memória/disco.

**Causas prováveis:**
- Connection pool da aplicação mal dimensionado ou sem timeout
- Vazamento de conexões (não fechadas após uso)
- Aumento real no número de instâncias/réplicas da aplicação
- Queries lentas segurando conexões por mais tempo que o normal
- max_connections configurado baixo demais para a carga atual

**Ação recomendada:** verificar conexões ociosas ("idle in transaction" no Postgres, "Sleep" no MySQL), revisar configuração do pool de conexões da aplicação e considerar um pooler (PgBouncer/ProxySQL) ou aumento do limite se justificado.

@equipe-infra`,
  },
  {
    key: 'dbReplication', kind: 'metric', label: 'DBM · Atraso de replicação', unit: 's',
    // MySQL: seconds_behind_master é o nome consagrado da métrica Datadog.
    // Verificado direto no código do check (mysql/const.py): tanto o campo
    // legado (Seconds_Behind_Master, SHOW SLAVE STATUS) quanto o moderno
    // (Seconds_Behind_Source, SHOW REPLICA STATUS, MySQL >=8.0.22/MariaDB
    // >=10.5.1) são mapeados pra ESSE MESMO nome de métrica Datadog — não
    // precisa de fallback, continua populado normalmente em instalações
    // modernas (achado da auditoria de métricas, ressalva anterior descartada).
    metric: (scope, by = '', engine = 'postgres') => engine === 'mysql'
      ? `avg:mysql.replication.seconds_behind_master{${scope}}${by}`
      : `avg:postgresql.replication_delay{${scope}}${by}`,
    defThresholds: { critical: 30, warning: 10 },
    defDeviations: 3,
    requiresEngine: true,
    flag: 'k8sDbmCoverage',
    hint: 'Atraso (em segundos) da réplica em relação ao primário (Postgres ou MySQL, escolha o engine ao lado).',
    message: `{{#is_alert}}🔴 [DBM · Replicação] {{host.name}} — réplica {{value}}s atrás do primário (crítico: {{threshold}}s).{{/is_alert}}{{#is_warning}}🟡 [DBM · Replicação] {{host.name}} — réplica {{value}}s atrás do primário (warning: {{warn_threshold}}s).{{/is_warning}}{{#is_alert_recovery}}✅ [DBM · Replicação] {{host.name}} — atraso de replicação voltou ao normal ({{value}}s, abaixo do limite).{{/is_alert_recovery}}{{#is_warning_recovery}}✅ [DBM · Replicação] {{host.name}} — atraso de replicação voltou ao normal ({{value}}s, abaixo do limite).{{/is_warning_recovery}}{{#is_no_data}}⚪ [DBM · Replicação] {{host.name}} — sem dados recentes.{{/is_no_data}}

**O que monitora:** atraso, em segundos, entre a réplica e o banco primário. Dispara quando esse atraso ultrapassa o limite configurado.

**Por que importa:** réplicas muito atrasadas servem dados desatualizados para leituras (stale reads) e, em caso de failover, podem causar perda de dados recentes — o atraso crescente também costuma indicar que a réplica não está acompanhando o volume de escrita do primário.

**Causas prováveis:**
- Réplica subdimensionada (CPU/disco/rede) para o volume de escrita do primário
- Pico de escrita no primário acima da capacidade normal de replicação
- Rede lenta ou instável entre primário e réplica
- Query longa ou lock bloqueando a aplicação do replication log na réplica
- Réplica em recuperação após reinício ou reconexão

**Ação recomendada:** verificar a saúde da réplica (I/O, rede, locks), confirmar se o volume de escrita no primário está anormal, e considerar aumentar recursos da réplica ou investigar a causa do atraso antes que afete failover/leituras.

@equipe-infra`,
  },
  {
    key: 'dbQueryHealth', kind: 'metric', label: 'DBM · Deadlocks / queries lentas', unit: 'ocorrências',
    // .as_count() porque somamos ocorrências na janela (mesmo padrão de
    // 'network' acima). MySQL soma deadlocks + slow queries num único
    // monitor; Postgres só expõe deadlocks como métrica de contagem.
    metric: (scope, by = '', engine = 'postgres') => engine === 'mysql'
      ? `sum:mysql.innodb.deadlocks{${scope}}${by}.as_count() + sum:mysql.performance.slow_queries{${scope}}${by}.as_count()`
      : `sum:postgresql.deadlocks{${scope}}${by}.as_count()`,
    defThresholds: { critical: 5, warning: 1 },
    defDeviations: 3,
    requiresEngine: true,
    flag: 'k8sDbmCoverage',
    windowAgg: 'sum', // total na janela, não média por intervalo — ver comentário no campo
    hint: 'Deadlocks (Postgres/MySQL) e queries lentas (MySQL) na janela — escolha o engine ao lado.',
    message: `{{#is_alert}}🔴 [DBM · Deadlocks/Queries lentas] {{host.name}} — {{value}} ocorrência(s) na janela (crítico: {{threshold}}).{{/is_alert}}{{#is_warning}}🟡 [DBM · Deadlocks/Queries lentas] {{host.name}} — {{value}} ocorrência(s) na janela (warning: {{warn_threshold}}).{{/is_warning}}{{#is_alert_recovery}}✅ [DBM · Deadlocks/Queries lentas] {{host.name}} — ocorrências voltaram ao normal ({{value}}, abaixo do limite).{{/is_alert_recovery}}{{#is_warning_recovery}}✅ [DBM · Deadlocks/Queries lentas] {{host.name}} — ocorrências voltaram ao normal ({{value}}, abaixo do limite).{{/is_warning_recovery}}{{#is_no_data}}⚪ [DBM · Deadlocks/Queries lentas] {{host.name}} — sem dados recentes.{{/is_no_data}}

**O que monitora:** número de deadlocks (Postgres e MySQL) e queries lentas (MySQL) registrados no banco dentro da janela avaliada.

**Por que importa:** deadlocks fazem transações inteiras falharem e serem revertidas, e queries lentas seguram conexões e recursos por mais tempo — ambos degradam a experiência do usuário e, em volume alto, podem sinalizar um problema estrutural de schema/índices ou de concorrência na aplicação.

**Causas prováveis:**
- Transações que acessam as mesmas tabelas em ordens diferentes (deadlock)
- Falta de índice adequado, causando table scans e queries lentas
- Transações longas demais segurando locks por muito tempo
- Aumento real de concorrência/volume de escrita na aplicação
- Migração ou job em lote rodando durante horário de pico

**Ação recomendada:** revisar o log de deadlocks/slow query log para identificar as queries e tabelas envolvidas, ajustar índices e ordem de acesso às tabelas nas transações, e mover jobs pesados para janelas de menor concorrência.

@equipe-infra`,
  },
]
export const INFRA_BY_KEY: Record<string, InfraType> = Object.fromEntries(INFRA_TYPES.map(t => [t.key, t]))
export const DEFAULT_INFRA_GROUP_BY = ['host']

export interface InfraMetricConfig {
  enabled: boolean
  mode: 'threshold' | 'anomaly' | 'outlier'
  thresholds: InfraThresholds & { criticalRecovery: number | null; warningRecovery: number | null }
  deviations: number
  direction: 'above' | 'below'
  algorithm: string
  seasonality: string
  queryWindow: string
  alertWindow: string
  evaluationDelay: number
  priority: number | null
  // Só usados no modo 'outlier' (ver OutlierAlgorithm) — tolerance é o
  // parâmetro de sensibilidade do algoritmo (DBSCAN: multiplicador da
  // distância ε; MAD: nº de desvios da mediana). percentage só se aplica
  // aos algoritmos MAD/scaledMAD (% de pontos do grupo considerados outlier).
  tolerance?: number
  percentage?: number
  // Só usado pelas métricas com requiresEngine:true (dbConnections/
  // dbReplication/dbQueryHealth) — Postgres ou MySQL, escolhido pelo usuário.
  dbEngine?: DbEngine
}

export interface InfraCheckConfig {
  enabled: boolean
  mode: 'check'
  counts: InfraCounts
  window: number
  priority: number | null
}

export type InfraConfig = InfraMetricConfig | InfraCheckConfig

// Shape de cada item de InfraDiscoveryState.hosts: vem direto da resposta de
// GET /api/datadog/hosts (ver src/app/api/datadog/hosts/route.ts) — não é
// só o nome, a UI (DiscoveryConfigureInfra) também usa `up` pra exibir o tag
// de status "up"/"down" na lista de hosts descobertos.
export interface DiscoveredHost {
  name: string
  up: boolean
  muted?: boolean
  lastReportedAt?: number | null
  tags?: string[]
}

export interface InfraDiscoveryState {
  hosts: DiscoveredHost[]
  selected: Record<string, boolean>
  metrics: Record<string, InfraConfig>
  groupBy: string[]
  messages: Record<string, string>
  namePrefix: string
  tags: string[]
  notifyTarget: string
}

export function initialInfraDiscovery(): InfraDiscoveryState {
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
            priority: 3, // 1-5 (P1-P5) ou null = sem prioridade — campo nativo do Datadog. Default P3.
          }]
        }
        return [t.key, {
          enabled: t.key === 'cpu' || t.key === 'memory',
          mode: 'threshold',            // 'threshold' | 'anomaly'
          // criticalRecovery/warningRecovery: opcionais (null = sem recovery
          // threshold, mesmo comportamento de sempre — o monitor recupera
          // assim que o valor cruza de volta o próprio critical/warning).
          // Quando definidos (só fazem sentido no modo 'threshold', que só
          // dispara "acima de"), viram options.thresholds.critical_recovery/
          // warning_recovery no payload — hysteresis pra cortar flapping em
          // métricas que oscilam perto do limite. https://docs.datadoghq.com/monitors/guide/recovery-thresholds/
          thresholds: { ...t.defThresholds, criticalRecovery: null, warningRecovery: null },
          deviations: t.defDeviations,
          direction: 'above',
          algorithm: 'robust',
          seasonality: 'weekly',
          // queryWindow (janela externa do avg()) = exatamente 5x o
          // alert_window de 15m, batendo em cheio a recomendação oficial do
          // Datadog pro modo anomaly ("Datadog recommends the query_window to
          // be around five times the alert_window" — docs.datadoghq.com/
          // monitors/types/anomaly/). Achado da auditoria: o comentário
          // anterior assumia que a Datadog só aceitava um conjunto fechado de
          // janelas (5m/15m/1h) — não é verdade, a doc de configuração de
          // monitor confirma um campo "custom" aceitando qualquer duração
          // entre 1min e 48h, então "last_75m" é uma janela válida. Mesmo
          // valor já usado em discovery.ts pros tipos com alertWindow=15m.
          // Também vale pro modo threshold (mesmo campo): resulta numa média
          // mais suave/menos sensível a picos passageiros.
          queryWindow: 'last_75m',
          alertWindow: 'last_15m',
          // interval=60 na query do modo anomaly (rollup de 60s) — doc do
          // Datadog recomenda evaluation_delay >= esse rollup. Também útil no
          // modo threshold pra métricas de integrações cloud que atrasam.
          evaluationDelay: 60,
          priority: 3,
          ...(t.requiresEngine ? { dbEngine: 'postgres' as DbEngine } : {}),
        }]
      })
    ),
    groupBy: [...DEFAULT_INFRA_GROUP_BY],
    messages: Object.fromEntries(INFRA_TYPES.map(t => [t.key, t.message])),
    namePrefix: '[MonitorsCreator]',
    tags: [],
    // '' = mantém o @equipe-infra de cada template; preenchido, substitui
    // esse mention em todos os monitores do plano — mesmo mecanismo de
    // discovery.ts (roteamento sem editar mensagem por mensagem).
    notifyTarget: '',
  }
}

// ── Construção de query/payload (fonte única) ──
// host aceita string[] só pro modo 'outlier' (grupo inteiro comparado numa
// única query, via OR entre os hosts — sintaxe de escopo do Datadog aceita
// boolean dentro de {}). Nos demais modos é sempre um host só.
function scopeOf(host: string | string[], extraTags?: string[]): string {
  const hostExpr = Array.isArray(host) ? host.map(h => `host:${h}`).join(' OR ') : `host:${host}`
  const parts = [hostExpr]
  for (const t of (extraTags || [])) if (t) parts.push(t)
  return parts.join(',')
}
function byClauseOf(groupBy?: string[]): string {
  const g = (groupBy || []).filter(Boolean)
  return g.length ? ` by {${g.join(',')}}` : ''
}

export interface BuildInfraQueryArgs {
  kind: string
  host: string | string[]
  extraTags?: string[]
  groupBy?: string[]
  mode?: 'threshold' | 'anomaly' | 'outlier'
  thresholds: InfraThresholds
  deviations?: number
  direction?: string
  algorithm?: string
  seasonality?: string
  queryWindow?: string
  alertWindow?: string
  tolerance?: number
  percentage?: number
  engine?: DbEngine
}

export function buildInfraQuery({ kind, host, extraTags, groupBy, mode, thresholds, deviations, direction = 'above', algorithm = 'robust', seasonality = 'weekly', queryWindow = 'last_1h', alertWindow = 'last_15m', tolerance, percentage, engine }: BuildInfraQueryArgs): string {
  const t = INFRA_BY_KEY[kind] as InfraMetricType
  const scope = scopeOf(host, extraTags)
  // Outlier PRECISA de `by {host}` (é o que define "cada série = 1 host" pra
  // comparar) — grupos custom (groupBy do usuário) ainda entram junto, mas
  // 'host' nunca pode faltar aqui, senão outliers() não tem o que comparar.
  const by = mode === 'outlier'
    ? byClauseOf(['host', ...(groupBy || []).filter(g => g !== 'host'), ...(t.extraBy || [])])
    : byClauseOf([...(groupBy || ['host']), ...(t.extraBy || [])])
  // `by` é passado PARA DENTRO de metric() (não concatenado depois) porque
  // expressões com mais de um termo (ex.: "network", soma de duas métricas)
  // precisam do `by {...}` em cada termo — colado só no final, o Datadog
  // aplicaria o group-by apenas ao último termo da expressão.
  const m = t.metric(scope, by, engine)

  if (mode === 'anomaly') {
    const seas = algorithm !== 'basic' ? `, seasonality='${seasonality}'` : ''
    return `avg(${queryWindow}):anomalies(${m}, '${algorithm}', ${deviations}, direction='${direction}', alert_window='${alertWindow}', interval=60, count_default_zero='true'${seas}) >= 1`
  }
  if (mode === 'outlier') {
    const algo = (algorithm || 'DBSCAN') as OutlierAlgorithm
    // percentage só existe pra MAD/scaledMAD (doc: dashboards/functions/algorithms).
    const supportsPercentage = algo === 'MAD' || algo === 'scaledMAD'
    const pct = supportsPercentage && percentage != null ? `, ${percentage}` : ''
    return `avg(${queryWindow}):outliers(${m}, '${algo}', ${tolerance ?? 3}${pct}) >= 1`
  }
  // threshold simples: type "metric alert" exige o valor de "critical" na
  // própria query (options.thresholds.critical deve bater com esse valor).
  // thresholdDirection:'below' inverte o comparador (ex.: k8sNodeReady, onde
  // o valor RUIM é baixo, não alto). windowAgg troca avg()->sum() só pros
  // tipos de CONTAGEM (network, dbQueryHealth) — ver comentário no campo.
  const cmp = t.thresholdDirection === 'below' ? '<' : '>'
  const agg = t.windowAgg ?? 'avg'
  return `${agg}(${queryWindow}):${m} ${cmp} ${thresholds.critical}`
}

export interface InfraMonitorPayload {
  name: string
  type: string
  query: string
  message: string
  tags: string[]
  priority?: number
  options: Record<string, unknown>
}

interface BuildMetricInfraArgs extends BuildInfraQueryArgs {
  message?: string
  tags?: string[]
  namePrefix?: string
  noDataMinutes?: number
  evaluationDelay?: number
  priority?: number | null
  notifyTarget?: string
  thresholds: InfraThresholds & { criticalRecovery?: number | null; warningRecovery?: number | null }
}

function buildMetricInfraMonitorPayload({ kind, host, extraTags, groupBy, mode, thresholds, deviations, direction, algorithm, seasonality, queryWindow, alertWindow, tolerance, percentage, engine, message, tags, namePrefix, noDataMinutes = 10, evaluationDelay, priority, notifyTarget }: BuildMetricInfraArgs): InfraMonitorPayload {
  const t = INFRA_BY_KEY[kind] as InfraMetricType
  const hostLabel = Array.isArray(host) ? `${host.length} host(s)` : host
  const name = `${(namePrefix || '[MonitorsCreator]').trim()} ${hostLabel} · Infra · ${t.label}${mode === 'outlier' ? ' (outlier)' : ''}`.trim()

  const baseTags = ['created_by:monitorscreator', `infra_metric:${kind}`]
  for (const h of (Array.isArray(host) ? host : [host])) baseTags.push(`host:${h}`)
  for (const tg of (tags || [])) if (tg && !baseTags.includes(tg)) baseTags.push(tg)

  let resolvedMessage = message || t.message
  if (notifyTarget) resolvedMessage = resolvedMessage.replaceAll('@equipe-infra', notifyTarget)

  return {
    name,
    type: 'query alert',
    query: buildInfraQuery({ kind, host, extraTags, groupBy, mode, thresholds, deviations, direction, algorithm, seasonality, queryWindow, alertWindow, tolerance, percentage, engine }),
    message: resolvedMessage,
    tags: baseTags,
    // priority é campo de TOPO no monitor (não dentro de options) — P1 a P5.
    ...(priority ? { priority } : {}),
    options: {
      thresholds: (mode === 'anomaly' || mode === 'outlier')
        ? { critical: 1.0 }
        : {
            critical: thresholds.critical,
            warning: thresholds.warning,
            // Recovery threshold (hysteresis): só entra no payload se o
            // usuário definiu um valor — omitido, o monitor mantém o
            // comportamento padrão (recupera ao cruzar de volta o próprio
            // critical/warning).
            ...(Number.isFinite(thresholds.criticalRecovery) ? { critical_recovery: thresholds.criticalRecovery } : {}),
            ...(Number.isFinite(thresholds.warningRecovery) ? { warning_recovery: thresholds.warningRecovery } : {}),
          },
      // threshold_windows/trigger_window é um artefato específico de anomaly
      // (precisa casar com alert_window da query) — outlier não documenta
      // esse campo, então não inventamos um valor pra ele aqui.
      ...(mode === 'anomaly' ? {
        threshold_windows: { trigger_window: alertWindow || 'last_15m', recovery_window: alertWindow || 'last_15m' },
      } : {}),
      // Host sem dados é o próprio incidente (crash, agent parado, rede
      // caiu) — diferente do monitor de serviço, aqui isso PRECISA alertar.
      notify_no_data: true,
      no_data_timeframe: noDataMinutes,
      // Re-notificação fica no padrão do Datadog (não configurável aqui).
      // Métricas de integrações cloud costumam chegar atrasadas; evita
      // falso "sem dados" ou leitura de janela incompleta.
      ...(evaluationDelay ? { evaluation_delay: evaluationDelay } : {}),
      notify_audit: false,
      // A doc recomenda require_full_window:false explicitamente só pra
      // métricas ESPARSAS (lambda/cloud com gaps naturais) — nenhuma métrica
      // de infra/DBM daqui é esparsa (Agent/DBM reportam continuamente), então
      // `true` evita avaliar/disparar com janela incompleta (ex.: logo após
      // criar o monitor ou reiniciar o host). Achado da auditoria de métricas
      // — ver https://docs.datadoghq.com/monitors/faq/what-is-the-do-not-require-a-full-window-of-data-for-evaluation-monitor-parameter/
      require_full_window: true,
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
function buildHostCheckQuery({ host, extraTags, check, window = 4 }: { host: string; extraTags?: string[]; check: string; window?: number }): string {
  const scope = scopeOf(host, extraTags)
  const over = scope.split(',').map(s => `"${s}"`).join(', ')
  return `"${check}".over(${over}).by("host").last(${window}).count_by_status()`
}

interface BuildHostCheckArgs {
  kind: string
  host: string
  extraTags?: string[]
  counts?: InfraCounts
  window?: number
  message?: string
  tags?: string[]
  namePrefix?: string
  priority?: number | null
  notifyTarget?: string
}

function buildHostCheckMonitorPayload({ kind, host, extraTags, counts, window, message, tags, namePrefix, priority, notifyTarget }: BuildHostCheckArgs): InfraMonitorPayload {
  const t = INFRA_BY_KEY[kind] as InfraCheckType
  const name = `${(namePrefix || '[MonitorsCreator]').trim()} ${host} · Infra · ${t.label}`.trim()

  const baseTags = ['created_by:monitorscreator', `host:${host}`, `infra_metric:${kind}`]
  for (const tg of (tags || [])) if (tg && !baseTags.includes(tg)) baseTags.push(tg)

  let resolvedMessage = message || t.message
  if (notifyTarget) resolvedMessage = resolvedMessage.replaceAll('@equipe-infra', notifyTarget)

  return {
    name,
    type: 'service check',
    query: buildHostCheckQuery({ host, extraTags, check: t.check, window: window || t.defWindow }),
    message: resolvedMessage,
    tags: baseTags,
    ...(priority ? { priority } : {}),
    options: {
      thresholds: { critical: counts?.critical ?? t.defCounts.critical, warning: counts?.warning ?? t.defCounts.warning, ok: counts?.ok ?? 1 },
      // O próprio check "sem reportar mais nada" já é coberto por
      // notify_no_data aqui — diferente das métricas, faz sentido manter
      // ligado, pois um Agent totalmente sumido também deve alertar.
      notify_no_data: true,
      no_data_timeframe: (window || t.defWindow) * 2,
      notify_audit: false,
    },
  }
}

// Dispatcher único usado pelo preview e pela rota de criação — decide entre
// o payload de métrica e o de service check conforme INFRA_BY_KEY[kind].kind.
export function buildInfraMonitorPayload(args: BuildMetricInfraArgs | BuildHostCheckArgs): InfraMonitorPayload {
  const t = INFRA_BY_KEY[args.kind]
  return t?.kind === 'check' ? buildHostCheckMonitorPayload(args as BuildHostCheckArgs) : buildMetricInfraMonitorPayload(args as BuildMetricInfraArgs)
}

export interface InfraPlanItem {
  kind: string
  label: string
  service: string
  operation: string
  name: string
  query: string
  message: string
  priority: number | null
  payload: InfraMonitorPayload
}

// Expande o estado de descoberta de infra em uma lista de monitores
// previstos. Um monitor por (host selecionado × métrica habilitada) — EXCETO
// no modo 'outlier', que gera 1 monitor pro GRUPO INTEIRO de hosts
// selecionados (ver comentário no topo do arquivo), por isso sai do loop
// por host normal e é tratado à parte, antes dele.
export function planInfraPreview(infraDiscovery: Partial<InfraDiscoveryState>): InfraPlanItem[] {
  const d = infraDiscovery || {}
  const { selected = {}, metrics = {}, groupBy = DEFAULT_INFRA_GROUP_BY, tags = [], namePrefix = '[MonitorsCreator]', messages = {}, notifyTarget = '' } = d
  const hosts = Object.keys(selected).filter(h => selected[h])

  const plan: InfraPlanItem[] = []

  // Outlier primeiro (1 item por métrica em modo outlier, cobrindo TODOS os
  // hosts selecionados de uma vez — não entra no loop por host abaixo).
  if (hosts.length > 0) {
    for (const t of INFRA_TYPES) {
      const cfg = metrics[t.key]
      if (!cfg?.enabled || cfg.mode !== 'outlier') continue
      const payload = buildInfraMonitorPayload({
        kind: t.key, host: hosts, groupBy, tags, namePrefix, message: messages[t.key], notifyTarget,
        mode: 'outlier',
        thresholds: (t as InfraMetricType).defThresholds,
        algorithm: cfg.algorithm || 'DBSCAN',
        tolerance: cfg.tolerance ?? 3,
        percentage: cfg.percentage,
        queryWindow: cfg.queryWindow || 'last_75m',
        evaluationDelay: cfg.evaluationDelay ?? 60,
        priority: cfg.priority,
        engine: cfg.dbEngine,
      })
      plan.push({ kind: t.key, label: t.label, service: `${hosts.length} host(s)`, operation: t.label, name: payload.name, query: payload.query, message: payload.message, priority: cfg.priority ?? null, payload })
    }
  }

  for (const host of hosts) {
    for (const t of INFRA_TYPES) {
      const cfg = metrics[t.key]
      if (!cfg?.enabled || cfg.mode === 'outlier') continue // outlier já tratado acima, em grupo

      const payload = cfg.mode === 'check'
        ? buildInfraMonitorPayload({
            kind: t.key, host, tags, namePrefix, message: messages[t.key], notifyTarget,
            counts: cfg.counts || (t as InfraCheckType).defCounts,
            window: cfg.window || (t as InfraCheckType).defWindow,
            priority: cfg.priority,
          })
        : buildInfraMonitorPayload({
            kind: t.key, host, groupBy, tags, namePrefix, message: messages[t.key], notifyTarget,
            mode: cfg.mode || 'threshold',
            thresholds: cfg.thresholds || (t as InfraMetricType).defThresholds,
            deviations: cfg.deviations || (t as InfraMetricType).defDeviations,
            direction: cfg.direction || 'above',
            algorithm: cfg.algorithm || 'robust',
            seasonality: cfg.seasonality || 'weekly',
            queryWindow: cfg.queryWindow || 'last_75m',
            alertWindow: cfg.alertWindow || 'last_15m',
            evaluationDelay: cfg.evaluationDelay ?? 60,
            noDataMinutes: (t as InfraMetricType).defNoDataMinutes,
            priority: cfg.priority,
            engine: (cfg as InfraMetricConfig).dbEngine,
          })
      plan.push({ kind: t.key, label: t.label, service: host, operation: t.label, name: payload.name, query: payload.query, message: payload.message, priority: cfg.priority ?? null, payload })
    }
  }
  return plan
}
