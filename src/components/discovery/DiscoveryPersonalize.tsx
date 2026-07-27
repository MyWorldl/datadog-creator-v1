// src/components/discovery/DiscoveryPersonalize.tsx
'use client'

import { useState, type CSSProperties } from 'react'
import { ALERT_TYPES, ALERT_BY_KEY } from '@/lib/discovery'
import { INFRA_TYPES, INFRA_BY_KEY } from '@/lib/infra'
import type { DiscoveryStepProps } from './types'

const COMMON_GROUP_BY = ['service', 'resource_name', 'env', 'version', 'kube_namespace', 'http.status_code']
const COMMON_INFRA_GROUP_BY = ['host', 'device', 'availability-zone']

const s: Record<string, CSSProperties> = {
  card: { border: '0.5px solid var(--border)', borderRadius: 12, padding: '1.25rem', background: 'var(--bg-surface)', display: 'flex', flexDirection: 'column', gap: 18 },
  label: { display: 'block', fontSize: 13, color: 'var(--text-secondary)', marginBottom: 6, fontWeight: 600 },
  hint: { fontSize: 11, color: 'var(--text-muted)', marginTop: 4 },
  input: { width: '100%', fontSize: 13, padding: '8px 10px', border: '0.5px solid var(--border)', borderRadius: 8, background: 'var(--bg-surface-2)', color: 'var(--text-primary)', outline: 'none', boxSizing: 'border-box' },
  tag: { display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, padding: '4px 10px', borderRadius: 999, background: 'var(--accent-light)', color: 'var(--accent)', border: '1px solid var(--accent)' },
  tagX: { cursor: 'pointer', fontWeight: 700, border: 'none', background: 'none', color: 'var(--accent)', fontSize: 13, lineHeight: 1 },
  textarea: { width: '100%', fontSize: 12.5, padding: '9px 12px', border: '0.5px solid var(--border)', borderRadius: 8, background: 'var(--bg-surface-2)', color: 'var(--text-primary)', outline: 'none', boxSizing: 'border-box', minHeight: 72, lineHeight: 1.5, fontFamily: 'inherit', resize: 'vertical' },
  msgHead: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6, flexWrap: 'wrap', gap: 8 },
  prioritySelect: { fontSize: 12, padding: '4px 8px', border: '0.5px solid var(--border)', borderRadius: 6, background: 'var(--bg-surface-2)', color: 'var(--text-secondary)', outline: 'none' },
  reset: { fontSize: 11, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer' },
  btn: { fontSize: 13, fontWeight: 600, color: '#fff', background: 'var(--accent)', border: 'none', borderRadius: 8, padding: '9px 18px', cursor: 'pointer' },
  btnGhost: { fontSize: 13, color: 'var(--text-secondary)', background: 'none', border: '0.5px solid var(--border)', borderRadius: 8, padding: '9px 18px', cursor: 'pointer' },
  addBtn: { fontSize: 13, fontWeight: 600, color: 'var(--accent)', background: 'none', border: '0.5px solid var(--accent)', borderRadius: 8, padding: '8px 14px', cursor: 'pointer' },
  actions: { display: 'flex', justifyContent: 'space-between', paddingTop: 4 },
}

const chipStyle = (on: boolean): CSSProperties => ({ fontSize: 12, padding: '6px 12px', borderRadius: 999, cursor: 'pointer', border: `1px solid ${on ? 'var(--accent)' : 'var(--border)'}`, background: on ? 'var(--accent-light)' : 'var(--bg-surface-2)', color: on ? 'var(--accent)' : 'var(--text-secondary)', fontWeight: on ? 600 : 400 })

// discovery.ts (DiscoveryState) e infra.ts (InfraDiscoveryState) divergem em
// alerts/metrics e scopeType, mas compartilham o resto do shape usado aqui
// (groupBy/tags/messages/namePrefix/notifyTarget/notifyNoData/renotifyInterval)
// — este componente alterna entre os dois via isInfra, então tipamos só os
// campos comuns e acessamos os divergentes com cast pontual.
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

interface EnabledKeyConfig {
  enabled: boolean
  priority?: number | null
}

export default function DiscoveryPersonalize({ config, setConfig, onNext, onBack }: DiscoveryStepProps) {
  const isInfra = config.resourceType === 'infra'
  const stateKey = isInfra ? 'infra' : 'discovery'
  const d = (isInfra ? config.infra : config.discovery) as unknown as PersonalizeCommon
  const setDisc = (patch: Partial<PersonalizeCommon>) => setConfig(c => ({ ...c, [stateKey]: { ...(c as unknown as Record<string, object>)[stateKey], ...patch } } as typeof c))
  const [tagInput, setTagInput] = useState('')

  const TYPES = isInfra ? INFRA_TYPES : ALERT_TYPES
  const BY_KEY = isInfra ? INFRA_BY_KEY : ALERT_BY_KEY
  const groupByOptions = isInfra ? COMMON_INFRA_GROUP_BY : COMMON_GROUP_BY
  const enabledKeySet = (isInfra ? config.infra.metrics : config.discovery.alerts) as unknown as Record<string, EnabledKeyConfig>
  const enabled = TYPES.filter(t => enabledKeySet[t.key]?.enabled)
  const entityLabel = isInfra ? 'host' : (d.scopeType === 'namespace' ? 'namespace' : 'serviço')
  const entityTag = isInfra ? 'host' : (d.scopeType === 'namespace' ? 'kube_namespace' : 'service')

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
    const field = isInfra ? 'metrics' : 'alerts'
    const current = enabledKeySet
    setConfig(c => ({
      ...c,
      [stateKey]: {
        ...(c as unknown as Record<string, Record<string, unknown>>)[stateKey],
        [field]: { ...current, [key]: { ...current[key], priority: value ? Number(value) : null } },
      },
    } as typeof c))
  }

  return (
    <div style={s.card}>
      {/* Nome do monitor */}
      <div>
        <label style={s.label}>Nome do monitor (prefixo)</label>
        <input style={s.input} value={d.namePrefix} onChange={e => setDisc({ namePrefix: e.target.value })} placeholder="[MonitorsCreator]" />
        <p style={s.hint}>
          Cada monitor recebe: <strong>{(d.namePrefix || '[MonitorsCreator]')} &lt;{entityLabel}&gt; · &lt;tipo&gt;</strong>.
        </p>
      </div>

      {/* Tags */}
      <div>
        <label style={s.label}>Tags (aplicadas a todos os monitores)</label>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            style={s.input}
            value={tagInput}
            onChange={e => setTagInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addTag() } }}
            placeholder="team:payments"
          />
          <button style={s.addBtn} onClick={addTag}>+ Adicionar</button>
        </div>
        {(d.tags || []).length > 0 && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
            {(d.tags || []).map(t => (
              <span key={t} style={s.tag}>{t}<button style={s.tagX} onClick={() => removeTag(t)}>×</button></span>
            ))}
          </div>
        )}
        <p style={s.hint}>Além destas, cada monitor recebe created_by:monitorscreator, {entityTag}:&lt;{entityLabel}&gt;{!isInfra && <> e operation:&lt;operation&gt;</>}.</p>
      </div>

      {/* Notificação */}
      <div>
        <label style={s.label}>Notificação padrão (opcional)</label>
        <input
          style={s.input}
          value={d.notifyTarget || ''}
          onChange={e => setDisc({ notifyTarget: e.target.value })}
          placeholder={isInfra ? '@equipe-infra' : '@equipe-ops'}
        />
        <p style={s.hint}>
          Substitui {isInfra ? '@equipe-infra' : '@equipe-ops'} em TODAS as mensagens do plano (mesmo nas já
          personalizadas acima) — evita editar mensagem por mensagem pra rotear pra outro time/canal
          (ex.: @slack-checkout, @pagerduty-oncall). Em branco, mantém o padrão de cada template.
        </p>
      </div>

      {!isInfra && (
        <div>
          <label style={s.label}>Alertas sem dado / renotificação (aplicado a todos os tipos habilitados)</label>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: 'var(--text-secondary)' }}>
              <input type="checkbox" checked={!!d.notifyNoData} onChange={e => setDisc({ notifyNoData: e.target.checked })} />
              Notificar quando o serviço parar de reportar dado
            </label>
            <div>
              <label style={s.hint}>Reforçar notificação a cada (min, 0 = nunca)</label>
              <input
                style={{ ...s.input, width: 100 }}
                type="number" min="0" step="5"
                value={d.renotifyInterval ?? 0}
                onChange={e => setDisc({ renotifyInterval: Number(e.target.value) || 0 })}
              />
            </div>
          </div>
          <p style={s.hint}>
            Ausência de dado em monitor de SERVIÇO pode só significar baixo tráfego, não incidente — por isso vem
            desligado por padrão; ligue para tipos de criticidade alta. Renotificação reforça a notificação
            enquanto o monitor seguir em alerta (útil para P1/P2).
          </p>
        </div>
      )}

      {/* Group By */}
      <div>
        <label style={s.label}>Group By (dimensões do monitor)</label>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {[...new Set([...groupByOptions, ...d.groupBy])].map(tag => (
            <button key={tag} style={chipStyle(d.groupBy.includes(tag))} onClick={() => toggleGroup(tag)}>{tag}</button>
          ))}
        </div>
        <p style={s.hint}>
          {isInfra
            ? 'Padrão: host. Disco também agrupa por device automaticamente.'
            : 'Padrão: service e resource_name. Cada combinação vira um grupo avaliado separadamente.'}
        </p>
      </div>

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
                    style={s.prioritySelect}
                    value={enabledKeySet[t.key]?.priority ?? ''}
                    onChange={e => setPriority(t.key, e.target.value)}
                    title="Prioridade do monitor no Datadog"
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
              <textarea style={s.textarea} value={d.messages[t.key] ?? ''} onChange={e => setMessage(t.key, e.target.value)} />
            </div>
          ))}
        </div>
        <p style={s.hint}>
          Variáveis: {isInfra ? '{{host.name}}' : '{{service.name}}'}, {'{{value}}'}. Use @ para notificar (ex.: @slack-canal).
        </p>
      </div>

      <div style={s.actions}>
        <button style={s.btnGhost} onClick={onBack}>← Voltar</button>
        <button style={s.btn} onClick={onNext}>Continuar →</button>
      </div>
    </div>
  )
}
