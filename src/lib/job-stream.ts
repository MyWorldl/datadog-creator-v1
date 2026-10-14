// src/lib/job-stream.ts
//
// Respostas em STREAMING (NDJSON) para operações demoradas, pra UI mostrar uma
// barra de progresso REAL (etapas concluídas / total) em vez de um spinner.
//
// Protocolo (uma linha JSON por evento):
//   {"type":"progress","done":2,"total":6,"label":"Hosts listados"}
//   {"type":"result","data":{...}}                  — a resposta normal da rota
//   {"type":"error","status":502,"body":{"error":"..."}}
//
// A rota continua escrevendo `return Response.json(...)` nos ramos de sucesso e
// de erro: streamJob só lê esse Response no final e o converte em evento.
// Checagens que não demoram (auth, cache hit, validação de body) ficam FORA do
// streamJob e respondem JSON puro, como sempre — o cliente (job-client.ts)
// aceita os dois formatos.

export interface JobProgress {
  /** Define o total de etapas (pode ser chamado de novo se o total crescer). */
  setTotal(total: number): void
  /** Conclui 1 etapa. */
  step(label: string): void
  /** Atalho: conclui a etapa quando a promise termina (com sucesso ou erro). */
  tick<T>(promise: Promise<T>, label: string): Promise<T>
  /** Atualiza só o texto (sem avançar), p.ex. "página 3". */
  note(label: string): void
}

export function streamJob(run: (progress: JobProgress) => Promise<Response>, initialTotal = 1): Response {
  const enc = new TextEncoder()
  return new Response(new ReadableStream<Uint8Array>({
    async start(controller) {
      let done = 0
      let total = Math.max(1, initialTotal)
      let label = 'Iniciando…'
      let closed = false
      const send = (obj: unknown) => { if (!closed) controller.enqueue(enc.encode(JSON.stringify(obj) + '\n')) }
      const emit = () => send({ type: 'progress', done: Math.min(done, total), total, label })
      const progress: JobProgress = {
        setTotal(t) { total = Math.max(1, t); emit() },
        step(l) { done += 1; label = l; emit() },
        tick(p, l) { return p.finally(() => progress.step(l)) },
        note(l) { label = l; emit() },
      }
      emit()
      try {
        const res = await run(progress)
        let body: unknown = null
        try { body = await res.json() } catch { /* corpo vazio/não-JSON */ }
        if (res.ok) send({ type: 'result', data: body })
        else send({ type: 'error', status: res.status, body: body ?? { error: `Erro ${res.status}.` } })
      } catch (e) {
        send({ type: 'error', status: 500, body: { error: (e as Error).message || 'Falha inesperada.' } })
      } finally {
        closed = true
        controller.close()
      }
    },
  }), {
    headers: {
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Cache-Control': 'no-store, no-transform',
      'X-Accel-Buffering': 'no',
    },
  })
}
