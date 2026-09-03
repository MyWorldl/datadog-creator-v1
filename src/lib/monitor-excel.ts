// src/lib/monitor-excel.ts
//
// Exportação de plano de monitores pra Excel — extraído do
// DiscoveryCreate.tsx (que já baixava um Excel dos monitores CRIADOS) pra
// também servir o AuditMonitors, que precisa baixar o plano ANTES de criar
// (revisar em planilha o que vai ser enviado ao Datadog, antes de confirmar).
// Mesmo builder de workbook pros dois casos — só os dados mudam: aqui, sem
// coluna de ID (o monitor ainda não existe).
//
// Aceita PlanItem (discovery.ts) / InfraPlanItem (infra.ts) / LogMonitorPlanItem
// (log-monitors.ts) via um shape mínimo comum — os 3 já compartilham esses
// campos.

export interface ExcelPlanEntry {
  kind?: unknown
  label?: unknown
  name: string
  service?: unknown
  operation?: unknown
  query: string
  message: string
  priority: number | null
  payload: { type: string; tags: string[] }
}

// Primeira linha da mensagem (o resto é o corpo longo — O que monitora/Causas/
// Ação recomendada — que não cabe bem numa célula de planilha).
function firstLine(message: string): string {
  return (message || '').split('\n')[0].trim()
}

export function priorityLabel(priority: number | null): string {
  return priority ? `P${priority}` : 'Sem prioridade'
}

async function triggerDownload(buffer: ArrayBuffer | Uint8Array<ArrayBufferLike>, filename: string): Promise<void> {
  const blob = new Blob([buffer as BlobPart], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

// exceljs@4.x traz uma vulnerabilidade MODERADA transitiva (uuid <11.1.1 —
// "missing buffer bounds check", só afeta geração interna de UUID, nunca
// recebe input do usuário aqui). Investigado e mantido de propósito — ver
// mesmo comentário (mais detalhado) em DiscoveryCreate.tsx.
async function loadExcelJS() {
  return (await import('exceljs')).default
}

// Baixa o PLANO antes de criar (AuditMonitors, botão "Baixar Excel" na
// prévia de cada leva sugerida) — sem coluna de ID, já que nada foi criado
// ainda. Colunas mais detalhadas que o export pós-criação (inclui tipo do
// monitor no Datadog, tags e query completa), útil pra quem quer revisar
// em planilha antes de confirmar o envio.
export async function downloadPlanExcel(plan: ExcelPlanEntry[], filename: string): Promise<void> {
  if (plan.length === 0) return
  const ExcelJS = await loadExcelJS()
  const wb = new ExcelJS.Workbook()
  const sheet = wb.addWorksheet('Monitores sugeridos')
  sheet.columns = [
    { header: 'Tipo', key: 'tipo', width: 28 },
    { header: 'Nome do Monitor', key: 'nome', width: 50 },
    { header: 'Prioridade', key: 'prioridade', width: 16 },
    { header: 'Serviço/Host', key: 'servico', width: 26 },
    { header: 'Operação/Métrica', key: 'operacao', width: 22 },
    { header: 'Tipo (Datadog)', key: 'tipoDatadog', width: 16 },
    { header: 'Tags', key: 'tags', width: 42 },
    { header: 'Query', key: 'query', width: 80 },
    { header: 'Mensagem', key: 'mensagem', width: 60 },
  ]
  sheet.getRow(1).font = { bold: true }
  sheet.addRows(plan.map(p => ({
    tipo: String(p.label ?? p.kind ?? ''),
    nome: p.name,
    prioridade: priorityLabel(p.priority),
    servico: String(p.service ?? ''),
    operacao: String(p.operation ?? ''),
    tipoDatadog: p.payload.type,
    tags: (p.payload.tags || []).join(', '),
    query: p.query,
    mensagem: firstLine(p.message),
  })))
  const buffer = await wb.xlsx.writeBuffer()
  await triggerDownload(buffer, filename)
}

// Shape mínimo do resultado de criação usado abaixo — evita importar todo
// PlanResultItem de monitor-create-server.ts aqui só por causa de 2 campos.
export interface ExcelResultEntry {
  ok: boolean
  skipped?: boolean
  id?: unknown
}

// Baixa os RESULTADOS depois de criar (DiscoveryCreate.tsx, wizard
// MonitorsCreator) — só os monitores CRIADOS agora (não os que já existiam e
// foram pulados, já que esses não têm id novo). plan[i] e results[i] estão
// sempre alinhados 1:1: a rota processa o mesmo plano, na mesma ordem, que o
// cliente já calculou (mesma função pura, mesmo input).
export async function downloadResultsExcel(plan: ExcelPlanEntry[], resultsList: ExcelResultEntry[], filename: string): Promise<void> {
  const rows = plan
    .map((p, i) => ({ p, r: resultsList[i] }))
    .filter(({ r }) => r?.ok && !r?.skipped)
    .map(({ p, r }) => ({
      id: r.id,
      nome: p.name,
      prioridade: priorityLabel(p.priority),
      servico: String(p.service ?? ''),
      descricao: firstLine(p.message),
    }))
  if (rows.length === 0) return

  const ExcelJS = await loadExcelJS()
  const wb = new ExcelJS.Workbook()
  const sheet = wb.addWorksheet('Monitores')
  sheet.columns = [
    { header: 'ID', key: 'id', width: 14 },
    { header: 'Nome do Monitor', key: 'nome', width: 48 },
    { header: 'Prioridade', key: 'prioridade', width: 16 },
    { header: 'Nome do host/serviço', key: 'servico', width: 28 },
    { header: 'Descrição da mensagem', key: 'descricao', width: 64 },
  ]
  sheet.getRow(1).font = { bold: true }
  sheet.addRows(rows)

  const buffer = await wb.xlsx.writeBuffer()
  await triggerDownload(buffer, filename)
}
