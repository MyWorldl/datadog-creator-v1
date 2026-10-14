// src/components/discovery/DiscoveryPersonalize.tsx
'use client'

import { useId, useState, type CSSProperties } from 'react'
import { ALERT_TYPES, ALERT_BY_KEY, POD_RESTARTS_TYPE, POD_PENDING_TYPE, type DiscoveryState } from '@/lib/discovery'
import { INFRA_TYPES, INFRA_BY_KEY, type InfraDiscoveryState } from '@/lib/infra'
import type { LogMonitorsState } from '@/lib/log-monitors'
import { SLO_ALERT_TYPES, type SloMonitorsState } from '@/lib/slo-monitors'
import { sourcesFor, type DiscoveryStepProps, type PersonalizeSource } from './types'
import { useNamingSuggestion, suggestionNote } from './useNamingSuggestion'
import { DEFAULT_NAME_PREFIX } from '@/lib/naming-convention'

const COMMON_GROUP_BY = ['service', 'resource_name', 'env', 'version', 'kube_namespace', 'http.status_code']
const COMMON_INFRA_GROUP_BY = ['host', 'device', 'availability-zone']

const s: Record<string, CSSProperties> = {
  section: { display: 'flex', flexDirection: 'column', gap: 18, paddingBottom: 18, borderBottom: '0.5px solid var(--border)' },
  sectionHeading: { fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', margin: 0 },
  label: { display: 'block', fontSize: 13, color: 'var(--text-secondary)', marginBottom: 6, fontWeight: 600 },
  hint: { fontSize: 11, color: 'var(--text-muted)', marginTop: 4 },
  input: { width: '100%', fontSize: 13, padding: '8px 10px', border: '0.5px solid var(--border)', borderRadius: 8, background: 'var(--bg-surface-2)', color: 'var(--text-primary)', outline: 'none', boxSizing: 'border-box' },
  tag: { display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, padding: '4px 10px', borderRadius: 999, background: 'var(--accent-light)', color: 'var(--accent)', border: '1px solid var(--accent)' },
  tagX: { cursor: 'pointer', fontWeight: 700, border: 'none', background: 'none', color: 'var(--accent)', fontSize: 13, lineHeight: 1 },
  textarea: { width: '100%', fontSize: 12.5, padding: '9px 12px', border: '0.5px solid var(--border)', borderRadius: 8, background: 'var(--bg-surface-2)', color: 'var(--text-primary)', outline: 'none', boxSizing: 'border-box', minHeight: 72, lineHeight: 1.5, fontFamily: 'inherit', resize: 'vertical' },
  msgHead: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6, flexWrap: 'wrap', gap: 8 },
  prioritySelect: { fontSize: 12, padding: '4px 8px', border: '0.5px solid var(--border)', borderRadius: 6, background: 'var(--bg-surface-2)', color: 'var(--text-secondary)', outline: 'none' },
  reset: { fontSize: 11, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer' },
  actions: { display: 'flex', justifyContent: 'space-between', paddingTop: 4 },
}

const chipStyle = (on: boolean): CSSProperties => ({ fontSize: 12, padding: '6px 12px', borderRadius: 999, cursor: 'pointer', border: `1px solid ${on ? 'var(--accent)' : 'var(--border)'}`, background: on ? 'var(--accent-light)' : 'var(--bg-surface-2)', color: on ? 'var(--accent)' : 'var(--text-secondary)', fontWeight: on ? 600 : 400 })

interface TypeLike {
  key: string
  label: string
  message: string
}

interface EnabledKeyConfig {
  enabled: boolean
  priority?: number | null
}

// discovery.ts (DiscoveryState) e infra.ts (InfraDiscoveryState) divergem em
// alerts/metrics e scopeType, mas compartilham o resto do shape usado aqui
// (groupBy/tags/messages/namePrefix/notifyTarget/notifyNoData/renotifyInterval).
interface PersonalizeCommon {
  namePrefix: string
  tags?: string[]
  notifyTarget?: string
  notifyNoData?: boolean
  renotifyInterval?: number
  groupBy: string[]
  messages: Record<string, string>
  scopeType?: 'service' | 'namespace'
}

// Resolve, por fonte, qual "catálogo" de tipos personalizar — cada
// stateKey tem seu próprio conjunto: INFRA_TYPES pros dois slots infra-like
// (excluindo os K8s/DBM do slot genérico 'infra', que agora vivem só em
// 'k8sInfra'), ALERT_TYPES pro slot 'discovery', e [Pod Restarts, Pod
// Pending] pro slot 'k8sDiscovery' (não fazem parte de ALERT_TYPES — não são
// trace-based, ver comentário em lib/discovery.ts).
function catalogFor(src: PersonalizeSource): { TYPES: TypeLike[]; BY_KEY: Record<string, TypeLike>; groupByOptions: string[]; entityLabel: string; entityTag: string; showGroupBy: boolean } {
  if (src.stateKey === 'infra') {
    return { TYPES: INFRA_TYPES.filter(t => !t.flag), BY_KEY: INFRA_BY_KEY, groupByOptions: COMMON_INFRA_GROUP_BY, entityLabel: 'host', entityTag: 'host', showGroupBy: true }
  }
  if (src.stateKey === 'k8sInfra') {
    return { TYPES: INFRA_TYPES.filter(t => t.flag === 'k8sDbmCoverage'), BY_KEY: INFRA_BY_KEY, groupByOptions: COMMON_INFRA_GROUP_BY, entityLabel: 'host', entityTag: 'host', showGroupBy: true }
  }
  if (src.stateKey === 'k8sDiscovery') {
    // groupBy não é exposto aqui: Pod Restarts/Pod Pending usam um `by`
    // fixo (pod_name/kube_namespace), não o groupBy configurável genérico.
    return { TYPES: [POD_RESTARTS_TYPE, POD_PENDING_TYPE], BY_KEY: { [POD_RESTARTS_TYPE.key]: POD_RESTARTS_TYPE, [POD_PENDING_TYPE.key]: POD_PENDING_TYPE }, groupByOptions: [], entityLabel: 'namespace', entityTag: 'kube_namespace', showGroupBy: false }
  }
  return { TYPES: ALERT_TYPES, BY_KEY: ALERT_BY_KEY, groupByOptions: COMMON_GROUP_BY, entityLabel: 'serviço', entityTag: 'service', showGroupBy: true }
}

function enabledKeySetFor(src: PersonalizeSource, state: InfraDiscoveryState | DiscoveryState): Record<string, EnabledKeyConfig> {
  if (src.dataKind === 'infra') return (state as InfraDiscoveryState).metrics as unknown as Record<string, EnabledKeyConfig>
  if (src.stateKey === 'k8sDiscovery') {
    const d = state as DiscoveryState
    return { [POD_RESTARTS_TYPE.key]: d.podRestarts, [POD_PENDING_TYPE.key]: d.podPending }
  }
  return (state as DiscoveryState).alerts as unknown as Record<string, EnabledKeyConfig>
}

interface SectionProps {
  src: PersonalizeSource
  config: DiscoveryStepProps['config']
  setConfig: DiscoveryStepProps['setConfig']
  last: boolean
}

function PersonalizeSection({ src, config, setConfig, last }: SectionProps) {
  const isInfra = src.dataKind === 'infra'
  const d = config[src.stateKey] as unknown as PersonalizeCommon
  const setDisc = (patch: Partial<PersonalizeCommon>) => setConfig(c => ({ ...c, [src.stateKey]: { ...(c[src.stateKey] as object), ...patch } } as typeof c))
  const [tagInput, setTagInput] = useState('')
  // useId() (não id fixo): este componente renderiza mais de uma vez na mesma
  // página quando resourceType tem múltiplas fontes (ex.: k8sInfra +
  // k8sDiscovery em K8s/DBM) — um id fixo colidiria entre as seções.
  const uid = useId()

  // Convenção de nomes já usada no org -> pré-preenche o prefixo (editável).
  // Entidades escolhidas servem de dica pra achar monitores relacionados.
  const selectedMap = (config[src.stateKey] as unknown as { selected?: Record<string, unknown> }).selected || {}
  const nameSuggestion = useNamingSuggestion({
    prefix: d.namePrefix,
    hints: Object.keys(selectedMap).filter(k => selectedMap[k]),
    apply: suggested => setConfig(c => {
      const cur = c[src.stateKey] as unknown as PersonalizeCommon
      return cur.namePrefix === DEFAULT_NAME_PREFIX ? ({ ...c, [src.stateKey]: { ...(c[src.stateKey] as object), namePrefix: suggested } } as typeof c) : c
    }),
  })

  const { TYPES, BY_KEY, groupByOptions, entityLabel, entityTag, showGroupBy } = catalogFor(src)
  const enabledKeySet = enabledKeySetFor(src, config[src.stateKey] as InfraDiscoveryState | DiscoveryState)
  const enabled = TYPES.filter(t => enabledKeySet[t.key]?.enabled)

  function toggleGroup(tag: string) {
    const has = d.groupBy.includes(tag)
    setDisc({ groupBy: has ? d.groupBy.filter(t => t !== tag) : [...d.groupBy, tag] })
  }
  function addTag() {
    const v = tagInput.trim()
    if (!v) return
    if ((d.tags || []).includes(v)) { setTagInput(''); return }
    setDisc({ tags: [...(d.tags || []), v] })
    setTagInput('')
  }
  function removeTag(t: string) { setDisc({ tags: (d.tags || []).filter(x => x !== t) }) }
  function setMessage(key: string, value: string) { setDisc({ messages: { ...d.messages, [key]: value } }) }
  function resetMessage(key: string) { setDisc({ messages: { ...d.messages, [key]: BY_KEY[key].message } }) }
  function setPriority(key: string, value: string) {
    const field = isInfra ? 'metrics' : (src.stateKey === 'k8sDiscovery' ? null : 'alerts')
    setConfig(c => {
      const state = c[src.stateKey] as unknown as Record<string, unknown>
      if (field) {
        const current = state[field] as Record<string, EnabledKeyConfig>
        return { ...c, [src.stateKey]: { ...state, [field]: { ...current, [key]: { ...current[key], priority: value ? Number(value) : null } } } } as typeof c
      }
      // k8sDiscovery: podRestarts/podPending não ficam num record — são campos diretos do estado.
      const current = state[key] as EnabledKeyConfig
      return { ...c, [src.stateKey]: { ...state, [key]: { ...current, priority: value ? Number(value) : null } } } as typeof c
    })
  }

  return (
    <div style={last ? { ...s.section, borderBottom: 'none', paddingBottom: 0 } : s.section}>
      {src.heading && <p style={s.sectionHeading}>{src.heading}</p>}

      {/* Nome do monitor */}
      <div>
        <label style={s.label} htmlFor={`${uid}-prefix`}>Nome do monitor (prefixo)</label>
        <input id={`${uid}-prefix`} className="focus-ring" style={s.input} value={d.namePrefix} onChange={e => setDisc({ namePrefix: e.target.value })} placeholder="[MonitorsCreator]" />
        <p style={s.hint}>
          Cada monitor recebe: <strong>{(d.namePrefix || '[MonitorsCreator]')} &lt;{entityLabel}&gt; · &lt;tipo&gt;</strong> (Pod Pending é global, sem entidade no nome).
        </p>
        {nameSuggestion && d.namePrefix === nameSuggestion.prefix && (
          <p style={{ ...s.hint, color: 'var(--accent)' }}>{suggestionNote(nameSuggestion)} Edite se preferir outro.</p>
        )}
      </div>

      {/* Tags */}
      <div>
        <label style={s.label} htmlFor={`${uid}-tag`}>Tags (aplicadas a todos os monitores desta seção)</label>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            id={`${uid}-tag`}
            className="focus-ring"
            style={s.input}
            value={tagInput}
            onChange={e => setTagInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addTag() } }}
            placeholder="team:payments"
          />
          <button className="btn btn-outline" onClick={addTag}>+ Adicionar</button>
        </div>
        {(d.tags || []).length > 0 && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
            {(d.tags || []).map(t => (
              <span key={t} style={s.tag}>{t}<button style={s.tagX} onClick={() => removeTag(t)}>×</button></span>
            ))}
          </div>
        )}
        <p style={s.hint}>Além destas, cada monitor recebe created_by:monitorscreator{src.stateKey !== 'k8sDiscovery' && <>, {entityTag}:&lt;{entityLabel}&gt;</>}{src.stateKey === 'discovery' && <> e operation:&lt;operation&gt;</>}.</p>
      </div>

      {/* Notificação */}
      <div>
        <label style={s.label} htmlFor={`${uid}-notify`}>Notificação padrão (opcional)</label>
        <input
          id={`${uid}-notify`}
          className="focus-ring"
          style={s.input}
          value={d.notifyTarget || ''}
          onChange={e => setDisc({ notifyTarget: e.target.value })}
          placeholder={isInfra ? '@equipe-infra' : '@equipe-ops'}
        />
        <p style={s.hint}>
          Substitui {isInfra ? '@equipe-infra' : '@equipe-ops'} em TODAS as mensagens desta seção (mesmo nas já
          personalizadas acima) — evita editar mensagem por mensagem pra rotear pra outro time/canal
          (ex.: @slack-checkout, @pagerduty-oncall). Em branco, mantém o padrão de cada template.
        </p>
      </div>

      {!isInfra && (
        <div>
          <label style={s.label}>Alertas sem dado / renotificação (aplicado a todos os tipos habilitados desta seção)</label>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: 'var(--text-secondary)' }}>
              <input type="checkbox" checked={!!d.notifyNoData} onChange={e => setDisc({ notifyNoData: e.target.checked })} />
              Notificar quando parar de reportar dado
            </label>
            <div>
              <label style={s.hint} htmlFor={`${uid}-renotify`}>Reforçar notificação a cada (min, 0 = nunca)</label>
              <input
                id={`${uid}-renotify`}
                className="focus-ring"
                style={{ ...s.input, width: 100 }}
                type="number" min="0" step="5"
                value={d.renotifyInterval ?? 0}
                onChange={e => setDisc({ renotifyInterval: Number(e.target.value) || 0 })}
              />
            </div>
          </div>
        </div>
      )}

      {/* Group By */}
      {showGroupBy && (
        <div>
          <label style={s.label}>Group By (dimensões do monitor)</label>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {[...new Set([...groupByOptions, ...d.groupBy])].map(tag => (
              <button key={tag} className="chip" style={chipStyle(d.groupBy.includes(tag))} onClick={() => toggleGroup(tag)}>{tag}</button>
            ))}
          </div>
          <p style={s.hint}>
            {isInfra
              ? 'Padrão: host. Disco também agrupa por device automaticamente.'
              : 'Padrão: service e resource_name. Cada combinação vira um grupo avaliado separadamente.'}
          </p>
        </div>
      )}

      {/* Mensagens */}
      <div>
        <label style={s.label}>Mensagens dos monitores</label>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {enabled.map(t => (
            <div key={t.key}>
              <div style={s.msgHead}>
                <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-primary)' }}>{t.label}</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <select
                    className="focus-ring"
                    style={s.prioritySelect}
                    value={enabledKeySet[t.key]?.priority ?? ''}
                    onChange={e => setPriority(t.key, e.target.value)}
                    title="Prioridade do monitor no Datadog"
                    aria-label={`Prioridade do monitor de ${t.label}`}
                  >
                    <option value="">Sem prioridade</option>
                    <option value="1">P1</option>
                    <option value="2">P2</option>
                    <option value="3">P3</option>
                    <option value="4">P4</option>
                    <option value="5">P5</option>
                  </select>
                  <button style={s.reset} onClick={() => resetMessage(t.key)}>restaurar padrão</button>
                </div>
              </div>
              <textarea
                className="focus-ring"
                style={s.textarea}
                value={d.messages[t.key] ?? ''}
                onChange={e => setMessage(t.key, e.target.value)}
                aria-label={`Mensagem do monitor de ${t.label}`}
              />
            </div>
          ))}
          {enabled.length === 0 && <p style={s.hint}>Nenhum tipo habilitado nesta seção.</p>}
        </div>
        <p style={s.hint}>
          Variáveis: {isInfra ? '{{host.name}}' : '{{service.name}}'}, {'{{value}}'}. Use @ para notificar (ex.: @slack-canal).
        </p>
      </div>
    </div>
  )
}

// Seção dedicada pra fonte 'logMonitors' — NÃO reaproveita PersonalizeSection
// acima: aquela assume um catálogo FIXO de tipos togláveis (TYPES/BY_KEY +
// enabled/priority por chave conhecida de antemão), mas cada regra de log já
// é o monitor inteiro (a "lista de tipos" é dinâmica — 1 por regra criada na
// Etapa 2). Reaproveita só o estilo visual, não a lógica de catalogFor/
// enabledKeySetFor.
interface LogPersonalizeProps {
  config: DiscoveryStepProps['config']
  setConfig: DiscoveryStepProps['setConfig']
}

function LogPersonalizeSection({ config, setConfig }: LogPersonalizeProps) {
  const d = config.logMonitors
  const setLog = (patch: Partial<LogMonitorsState>) => setConfig(c => ({ ...c, logMonitors: { ...c.logMonitors, ...patch } }))
  const [tagInput, setTagInput] = useState('')
  const uid = useId()
  // Regras de log não têm "entidade" — sem dicas, cai na convenção do org inteiro.
  const nameSuggestion = useNamingSuggestion({
    prefix: d.namePrefix,
    hints: [],
    apply: suggested => setConfig(c => (c.logMonitors.namePrefix === DEFAULT_NAME_PREFIX ? { ...c, logMonitors: { ...c.logMonitors, namePrefix: suggested } } : c)),
  })

  function addTag() {
    const v = tagInput.trim()
    if (!v) return
    if (d.tags.includes(v)) { setTagInput(''); return }
    setLog({ tags: [...d.tags, v] })
    setTagInput('')
  }
  function removeTag(t: string) { setLog({ tags: d.tags.filter(x => x !== t) }) }
  function setMessage(ruleId: string, value: string) { setLog({ messages: { ...d.messages, [ruleId]: value } }) }
  function resetMessage(ruleId: string) {
    const { [ruleId]: _omit, ...rest } = d.messages
    void _omit
    setLog({ messages: rest })
  }

  return (
    <div style={{ ...s.section, borderBottom: 'none', paddingBottom: 0 }}>
      <div>
        <label style={s.label} htmlFor={`${uid}-prefix`}>Nome do monitor (prefixo)</label>
        <input id={`${uid}-prefix`} className="focus-ring" style={s.input} value={d.namePrefix} onChange={e => setLog({ namePrefix: e.target.value })} placeholder="[MonitorsCreator]" />
        <p style={s.hint}>Cada monitor recebe: <strong>{(d.namePrefix || '[MonitorsCreator]')} &lt;nome da regra&gt;</strong>.</p>
        {nameSuggestion && d.namePrefix === nameSuggestion.prefix && (
          <p style={{ ...s.hint, color: 'var(--accent)' }}>{suggestionNote(nameSuggestion)} Edite se preferir outro.</p>
        )}
      </div>

      <div>
        <label style={s.label} htmlFor={`${uid}-tag`}>Tags (aplicadas a todos os monitores desta seção)</label>
        <div style={{ display: 'flex', gap: 8 }}>
          <input id={`${uid}-tag`} className="focus-ring" style={s.input} value={tagInput} onChange={e => setTagInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addTag() } }} placeholder="team:payments" />
          <button className="btn btn-outline" onClick={addTag}>+ Adicionar</button>
        </div>
        {d.tags.length > 0 && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
            {d.tags.map(t => <span key={t} style={s.tag}>{t}<button style={s.tagX} onClick={() => removeTag(t)}>×</button></span>)}
          </div>
        )}
        <p style={s.hint}>Além destas, cada monitor recebe created_by:monitorscreator e monitor_kind:log.</p>
      </div>

      <div>
        <label style={s.label} htmlFor={`${uid}-notify`}>Notificação padrão (opcional)</label>
        <input id={`${uid}-notify`} className="focus-ring" style={s.input} value={d.notifyTarget || ''} onChange={e => setLog({ notifyTarget: e.target.value })} placeholder="@equipe-ops" />
        <p style={s.hint}>Substitui @equipe-ops em TODAS as mensagens desta seção (mesmo nas já personalizadas abaixo). Em branco, mantém o padrão de cada regra.</p>
      </div>

      <div>
        <label style={s.label}>Alertas sem dado / renotificação (aplicado a todas as regras desta seção)</label>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: 'var(--text-secondary)' }}>
            <input type="checkbox" checked={!!d.notifyNoData} onChange={e => setLog({ notifyNoData: e.target.checked })} />
            Notificar quando parar de reportar dado
          </label>
          <div>
            <label style={s.hint} htmlFor={`${uid}-renotify`}>Reforçar notificação a cada (min, 0 = nunca)</label>
            <input id={`${uid}-renotify`} className="focus-ring" style={{ ...s.input, width: 100 }} type="number" min="0" step="5" value={d.renotifyInterval ?? 0} onChange={e => setLog({ renotifyInterval: Number(e.target.value) || 0 })} />
          </div>
        </div>
      </div>

      <div>
        <label style={s.label}>Mensagens dos monitores</label>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {d.rules.map(r => (
            <div key={r.id}>
              <div style={s.msgHead}>
                <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-primary)' }}>{r.label || 'Regra sem nome'}</span>
                {d.messages[r.id] != null && <button style={s.reset} onClick={() => resetMessage(r.id)}>restaurar padrão</button>}
              </div>
              <textarea className="focus-ring" style={s.textarea} value={d.messages[r.id] ?? ''} onChange={e => setMessage(r.id, e.target.value)} placeholder="Deixe em branco para usar a mensagem padrão." aria-label={`Mensagem do monitor de ${r.label || 'regra sem nome'}`} />
            </div>
          ))}
          {d.rules.length === 0 && <p style={s.hint}>Nenhuma regra criada na etapa anterior.</p>}
        </div>
        <p style={s.hint}>Variáveis: {'{{value}}'}, {'{{threshold}}'}. Use @ para notificar (ex.: @slack-canal).</p>
      </div>
    </div>
  )
}

// Seção da fonte 'sloMonitors' — mesmo esqueleto da de Logs, mas as mensagens
// são por TIPO de alerta (burn rápido/lento/budget), não por regra: o nome do
// SLO entra via {{slo_name}} (trocado ao montar o plano).
function SloPersonalizeSection({ config, setConfig }: LogPersonalizeProps) {
  const d = config.sloMonitors
  const setSlo = (patch: Partial<SloMonitorsState>) => setConfig(c => ({ ...c, sloMonitors: { ...c.sloMonitors, ...patch } }))
  const [tagInput, setTagInput] = useState('')
  const uid = useId()
  const nameSuggestion = useNamingSuggestion({
    prefix: d.namePrefix,
    hints: [],
    apply: suggested => setConfig(c => (c.sloMonitors.namePrefix === DEFAULT_NAME_PREFIX ? { ...c, sloMonitors: { ...c.sloMonitors, namePrefix: suggested } } : c)),
  })

  function addTag() {
    const v = tagInput.trim()
    if (!v) return
    if (!d.tags.includes(v)) setSlo({ tags: [...d.tags, v] })
    setTagInput('')
  }
  function removeTag(t: string) { setSlo({ tags: d.tags.filter(x => x !== t) }) }
  function setMessage(kind: string, value: string) { setSlo({ messages: { ...d.messages, [kind]: value } }) }
  function resetMessage(kind: string) {
    const { [kind]: _omit, ...rest } = d.messages
    void _omit
    setSlo({ messages: rest })
  }
  const enabledTypes = SLO_ALERT_TYPES.filter(t => d.alerts[t.key]?.enabled)

  return (
    <div style={{ ...s.section, borderBottom: 'none', paddingBottom: 0 }}>
      <div>
        <label style={s.label} htmlFor={`${uid}-prefix`}>Nome do monitor (prefixo)</label>
        <input id={`${uid}-prefix`} className="focus-ring" style={s.input} value={d.namePrefix} onChange={e => setSlo({ namePrefix: e.target.value })} placeholder="[MonitorsCreator]" />
        <p style={s.hint}>Cada monitor recebe: <strong>{(d.namePrefix || '[MonitorsCreator]')} &lt;nome do SLO&gt; · &lt;tipo do alerta&gt;</strong>.</p>
        {nameSuggestion && d.namePrefix === nameSuggestion.prefix && (
          <p style={{ ...s.hint, color: 'var(--accent)' }}>{suggestionNote(nameSuggestion)} Edite se preferir outro.</p>
        )}
      </div>

      <div>
        <label style={s.label} htmlFor={`${uid}-tag`}>Tags (aplicadas a todos os monitores desta seção)</label>
        <div style={{ display: 'flex', gap: 8 }}>
          <input id={`${uid}-tag`} className="focus-ring" style={s.input} value={tagInput} onChange={e => setTagInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addTag() } }} placeholder="team:payments" />
          <button className="btn btn-outline" onClick={addTag}>+ Adicionar</button>
        </div>
        {d.tags.length > 0 && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
            {d.tags.map(t => <span key={t} style={s.tag}>{t}<button style={s.tagX} onClick={() => removeTag(t)}>×</button></span>)}
          </div>
        )}
        <p style={s.hint}>Além destas, cada monitor recebe created_by:monitorscreator, monitor_kind:slo, slo_id:&lt;id&gt; e slo_alert:&lt;tipo&gt;.</p>
      </div>

      <div>
        <label style={s.label} htmlFor={`${uid}-notify`}>Notificação padrão (opcional)</label>
        <input id={`${uid}-notify`} className="focus-ring" style={s.input} value={d.notifyTarget || ''} onChange={e => setSlo({ notifyTarget: e.target.value })} placeholder="@equipe-ops" />
        <p style={s.hint}>Substitui @equipe-ops em TODAS as mensagens desta seção. Em branco, mantém o padrão.</p>
      </div>

      <div>
        <label style={s.label} htmlFor={`${uid}-renotify`}>Reforçar notificação a cada (min, 0 = nunca)</label>
        <input id={`${uid}-renotify`} className="focus-ring" style={{ ...s.input, width: 100 }} type="number" min="0" step="5" value={d.renotifyInterval ?? 0} onChange={e => setSlo({ renotifyInterval: Number(e.target.value) || 0 })} />
      </div>

      <div>
        <label style={s.label}>Mensagens dos monitores (uma por tipo de alerta)</label>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {enabledTypes.map(t => (
            <div key={t.key}>
              <div style={s.msgHead}>
                <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-primary)' }}>{t.label}</span>
                {d.messages[t.key] != null && <button style={s.reset} onClick={() => resetMessage(t.key)}>restaurar padrão</button>}
              </div>
              <textarea className="focus-ring" style={s.textarea} value={d.messages[t.key] ?? ''} onChange={e => setMessage(t.key, e.target.value)} placeholder="Deixe em branco para usar a mensagem padrão (já cita o nome do SLO)." aria-label={`Mensagem do alerta ${t.label}`} />
            </div>
          ))}
          {enabledTypes.length === 0 && <p style={s.hint}>Nenhum tipo de alerta habilitado na etapa anterior.</p>}
        </div>
        <p style={s.hint}>Variáveis: {'{{value}}'}, {'{{threshold}}'}, {'{{slo_name}}'} (nome do SLO). Use @ para notificar (ex.: @slack-canal).</p>
      </div>
    </div>
  )
}

export default function DiscoveryPersonalize({ config, setConfig, onNext, onBack }: DiscoveryStepProps) {
  const sources = sourcesFor(config.resourceType)

  return (
    <div className="wz-card">
      {sources.map((src, i) => (
        src.dataKind === 'log'
          ? <LogPersonalizeSection key={src.stateKey} config={config} setConfig={setConfig} />
          : src.dataKind === 'slo'
            ? <SloPersonalizeSection key={src.stateKey} config={config} setConfig={setConfig} />
            : <PersonalizeSection key={src.stateKey} src={src} config={config} setConfig={setConfig} last={i === sources.length - 1} />
      ))}

      <div style={s.actions}>
        <button className="btn btn-ghost" onClick={onBack}><span className="btn-arrow-back" aria-hidden="true">←</span> Voltar</button>
        <button className="btn btn-primary" onClick={onNext}>Continuar <span className="btn-arrow" aria-hidden="true">→</span></button>
      </div>
    </div>
  )
}
