// src/lib/wizard-draft.ts
//
// Rascunho do wizard MonitorsCreator no localStorage: recarregar a página (ou
// fechar a aba sem querer) no meio de uma seleção grande — centenas de
// serviços, regras de log — não perde mais a configuração. Funções puras
// (sem acesso ao storage aqui), pra serem testáveis; a página só chama
// localStorage.getItem/setItem com o resultado.
//
// Nada sensível vai pro rascunho: o estado do wizard nunca contém as chaves do
// Datadog (ficam em cookie httpOnly no servidor) — só seleção/parâmetros.

export const DRAFT_KEY = 'dd_wizard_draft'
export const DRAFT_VERSION = 1
// Teto de tamanho (~2MB de JSON): estado gigante estoura a cota do storage e
// não vale a pena — melhor não salvar do que quebrar a página.
export const DRAFT_MAX_CHARS = 2_000_000

export interface WizardDraft<C> {
  v: number
  savedAt: number
  step: number
  config: C
}

type AnyConfig = Record<string, unknown>

// Tem algo digno de ser retomado? Rascunho vazio (só a tela inicial) não incomoda.
export function isDraftMeaningful(config: AnyConfig): boolean {
  const selectedCount = (k: string): number => {
    const st = config[k] as { selected?: Record<string, unknown> } | undefined
    return st?.selected ? Object.values(st.selected).filter(Boolean).length : 0
  }
  const rules = (config.logMonitors as { rules?: unknown[] } | undefined)?.rules
  return ['discovery', 'infra', 'k8sInfra', 'k8sDiscovery', 'sloMonitors'].some(k => selectedCount(k) > 0) || (Array.isArray(rules) && rules.length > 0)
}

export function serializeDraft<C>(step: number, config: C, now: number = Date.now()): string | null {
  const json = JSON.stringify({ v: DRAFT_VERSION, savedAt: now, step, config } satisfies WizardDraft<C>)
  return json.length > DRAFT_MAX_CHARS ? null : json
}

// Lê um rascunho salvo e o mescla por cima do estado inicial atual (campo a
// campo, por seção) — assim campos NOVOS adicionados depois do rascunho ter
// sido salvo (ex.: dbHosting) continuam com o valor padrão em vez de undefined.
// Devolve null se for inválido, de outra versão, ou vazio.
export function parseDraft<C extends AnyConfig>(raw: string | null, initial: C): WizardDraft<C> | null {
  if (!raw) return null
  let d: Partial<WizardDraft<AnyConfig>>
  try { d = JSON.parse(raw) } catch { return null }
  if (!d || d.v !== DRAFT_VERSION || typeof d.savedAt !== 'number' || typeof d.step !== 'number' || !d.config || typeof d.config !== 'object') return null
  const merged: AnyConfig = { ...initial }
  for (const [k, v] of Object.entries(d.config)) {
    const base = initial[k]
    merged[k] = base && typeof base === 'object' && !Array.isArray(base) && v && typeof v === 'object' && !Array.isArray(v)
      ? { ...(base as object), ...(v as object) }
      : v
  }
  if (!isDraftMeaningful(merged)) return null
  return { v: d.v, savedAt: d.savedAt, step: Math.max(0, Math.min(4, Math.floor(d.step))), config: merged as C }
}
