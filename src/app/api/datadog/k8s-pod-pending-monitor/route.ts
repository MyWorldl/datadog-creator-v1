// src/app/api/datadog/k8s-pod-pending-monitor/route.ts
//
// Cria o monitor "K8s · Pods pendentes" — ÚNICO e GLOBAL (não é por host,
// nem por namespace/serviço selecionado): kubernetes_state.pod.status_phase
// não tem uma entidade natural pra selecionar antes de criar (diferente de
// Infra/host ou Services/namespace), então este monitor cobre o CLUSTER
// inteiro de uma vez, com `by {kube_namespace}` só pra permitir triagem por
// namespace dentro do mesmo monitor — mesmo espírito do monitor de anomalia
// de consumo do FinOps (src/app/api/datadog/finops/monitor/route.ts).
//
// Query confirmada via WebSearch (docs/exemplos oficiais do Datadog):
//   min(last_10m):default_zero(max:kubernetes_state.pod.status_phase{phase:pending} by {kube_namespace}) > 0

import type { NextRequest } from 'next/server'
import { getServerUser } from '@/lib/supabase-server'
import { readSessionKeys } from '@/lib/session-keys'
import { ctxFrom, ddPost } from '@/lib/datadog-server'
import { isFeatureEnabled } from '@/lib/feature-flags'

const WINDOWS = ['last_5m', 'last_10m', 'last_15m', 'last_30m', 'last_1h']

export async function POST(request: NextRequest): Promise<Response> {
  const user = await getServerUser()
  if (!user) return Response.json({ error: 'Não autenticado.' }, { status: 401 })

  if (!isFeatureEnabled('k8sDbmCoverage')) {
    return Response.json({ error: 'Cobertura de Kubernetes/Database Monitoring ainda não está disponível.' }, { status: 403 })
  }

  const { apiKey, appKey, site } = await readSessionKeys()
  if (!apiKey || !appKey || !site) {
    return Response.json({ error: 'Sessão sem credenciais do Datadog.' }, { status: 412 })
  }

  let body: unknown = {}
  try { body = await request.json() } catch { /* body opcional: todos os campos têm default */ }
  const b = (body || {}) as { threshold?: unknown; window?: unknown; namePrefix?: unknown; notifyTarget?: unknown }

  const threshold = Number.isFinite(Number(b.threshold)) && Number(b.threshold) >= 0 ? Number(b.threshold) : 0
  const window = WINDOWS.includes(b.window as string) ? (b.window as string) : 'last_10m'
  const namePrefix = typeof b.namePrefix === 'string' && b.namePrefix.trim() ? b.namePrefix.trim() : '[MonitorsCreator]'
  const notifyTarget = typeof b.notifyTarget === 'string' ? b.notifyTarget.trim() : ''

  const query = `min(${window}):default_zero(max:kubernetes_state.pod.status_phase{phase:pending} by {kube_namespace}) > ${threshold}`

  let message = `🔴 [K8s · Pods pendentes] {{kube_namespace.name}} — {{value}} pod(s) pendente(s) (limite: {{threshold}}).

**O que monitora:** quantidade de pods no cluster no estado "Pending" (aceitos pelo control plane mas ainda não agendados/rodando em nenhum node), por namespace.

**Por que importa:** um pod preso em Pending geralmente significa que o cluster não consegue agendá-lo — falta de capacidade, afinidade/taint impossível de satisfazer, ou volume que não monta — e isso atrasa deploys, autoscaling e recuperação de pods que crasharam (ficam sem substituto rodando).

**Causas prováveis:**
- Capacidade insuficiente no cluster (CPU/memória) para os requests do pod
- Node affinity, anti-affinity ou taint/toleration impossível de satisfazer
- PersistentVolumeClaim pendente (nenhum volume disponível pra montar)
- Autoscaler ainda provisionando novo node (transitório) ou autoscaler travado
- Falta de imagem (ImagePullBackOff represado como Pending no scheduler)

**Ação recomendada:** verificar "kubectl describe pod" no namespace afetado pelo evento de scheduling (FailedScheduling), conferir capacidade disponível no cluster/node pool, e checar se o autoscaler está ativo e conseguindo provisionar novos nodes.

@equipe-infra`
  if (notifyTarget) message = message.replaceAll('@equipe-infra', notifyTarget)

  const payload = {
    name: `${namePrefix} K8s · Pods pendentes`.trim(),
    type: 'query alert',
    query,
    message,
    tags: ['created_by:monitorscreator', 'infra_metric:k8sPodPending'],
    options: {
      thresholds: { critical: threshold },
      notify_no_data: false,
      notify_audit: false,
      require_full_window: false,
      renotify_interval: 0,
      evaluation_delay: 60,
    },
  }

  const ctx = ctxFrom({ apiKey, appKey, site })
  const r = await ddPost<{ id?: unknown; errors?: string[] }>(ctx, '/api/v1/monitor', payload)
  if (!r.ok) {
    if (!r.status) return Response.json({ error: 'Falha de rede: ' + r.error, query }, { status: 502 })
    return Response.json({ error: r.json?.errors?.join('; ') || `Falha ao criar monitor (${r.status}).`, query }, { status: 502 })
  }
  return Response.json({ ok: true, id: r.json?.id, name: payload.name, query, url: `https://app.${site}/monitors/${r.json?.id}` })
}
