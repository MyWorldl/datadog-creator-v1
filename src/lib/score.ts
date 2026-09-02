// src/lib/score.ts
//
// scoreColor: mapeia um score 0-100 pra cor de status. Usado por
// ferramentas/dashboard/page.tsx e ferramentas/analise/page.tsx — estava
// copiado literalmente nos dois (achado da auditoria), extraído aqui.
//
// NÃO é usado por ferramentas/audit/page.tsx de propósito: lá o "score" é %
// de cobertura por entidade (host/serviço), com faixas de NEGÓCIO próprias
// (percentBand em lib/audit.ts: <=40/40-75/>=75) — diferente da escala de
// MATURIDADE aqui (>=80/>=50), documentado como divergência intencional
// desde uma auditoria anterior desta mesma sessão. Unificar os dois
// esconderia essa diferença de propósito, não é duplicação real.
export const scoreColor = (v: number | null | undefined): string =>
  v == null ? 'var(--text-muted)' : v >= 80 ? 'var(--success)' : v >= 50 ? 'var(--warning)' : 'var(--danger)'
