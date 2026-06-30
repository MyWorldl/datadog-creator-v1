'use client';

import { useState } from 'react';
import { useApp } from '@/context/AppContext';

/* ── helpers ── */
function ScoreRing({ value, color, size = 80 }) {
  const r = (size / 2) - 8;
  const circ = 2 * Math.PI * r;
  const dash = (value / 100) * circ;

  return (
    <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
      <circle cx={size/2} cy={size/2} r={r} fill="none"
        stroke="var(--border)" strokeWidth={7} />
      <circle cx={size/2} cy={size/2} r={r} fill="none"
        stroke={color} strokeWidth={7}
        strokeDasharray={`${dash} ${circ}`}
        strokeLinecap="round" />
    </svg>
  );
}

function MetricCard({ title, value, color, description, issues = [] }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{
      background: 'var(--bg-surface)',
      border: '1px solid var(--border)',
      borderRadius: 12,
      padding: '1.25rem',
      display: 'flex',
      flexDirection: 'column',
      gap: 10,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <div style={{ position: 'relative', width: 80, height: 80, flexShrink: 0 }}>
          <ScoreRing value={value} color={color} />
          <span style={{
            position: 'absolute', inset: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '1.1rem', fontWeight: 800, color,
          }}>
            {value}
          </span>
        </div>
        <div>
          <h3 style={{ fontWeight: 700, fontSize: '0.9375rem', color: 'var(--text-primary)', marginBottom: 4 }}>
            {title}
          </h3>
          <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
            {description}
          </p>
        </div>
      </div>

      {issues.length > 0 && (
        <div>
          <button
            onClick={() => setOpen(!open)}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'var(--accent)', fontSize: '0.8125rem', fontWeight: 600, padding: 0,
            }}
          >
            {open ? '▲ Ocultar detalhes' : `▼ Ver ${issues.length} problema(s)`}
          </button>
          {open && (
            <ul style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 5 }}>
              {issues.map((iss, i) => (
                <li key={i} style={{
                  display: 'flex', alignItems: 'flex-start', gap: 7,
                  fontSize: '0.8125rem', color: 'var(--text-secondary)',
                  padding: '0.4rem 0.6rem',
                  background: 'var(--bg-surface-2)',
                  borderRadius: 6,
                  listStyle: 'none',
                }}>
                  <span style={{ color, flexShrink: 0 }}>⚠</span>
                  {iss}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function parseAnalysis(text) {
  const sections = {
    saude: null,
    ruido: null,
    cobertura: null,
    governanca: null,
    resumo: '',
  };

  const extract = (label) => {
    const re = new RegExp(`${label}[^0-9]*([0-9]+)`, 'i');
    const m = text.match(re);
    return m ? Math.min(100, parseInt(m[1])) : null;
  };

  const extractIssues = (label) => {
    const re = new RegExp(`${label}[\\s\\S]*?(?=Ruído|Cobertura|Governança|Resumo|$)`, 'i');
    const block = text.match(re)?.[0] || '';
    return block.match(/[-•*]\s*(.+)/g)?.map(l => l.replace(/^[-•*]\s*/, '').trim()) || [];
  };

  sections.saude     = { score: extract('saúde|saude|health'),       issues: extractIssues('saúde|saude|health') };
  sections.ruido     = { score: extract('ruído|ruido|noise'),         issues: extractIssues('ruído|ruido|noise') };
  sections.cobertura = { score: extract('cobertura|coverage'),        issues: extractIssues('cobertura|coverage') };
  sections.governanca= { score: extract('governança|governanca|tag'), issues: extractIssues('governança|governanca|tag') };
  sections.resumo    = text.match(/resumo[:\s]*([\s\S]+)/i)?.[1]?.trim() || text.slice(0, 400);

  return sections;
}

const SCORE_COLOR = (v) => {
  if (v === null) return 'var(--text-muted)';
  if (v >= 80) return 'var(--success)';
  if (v >= 50) return 'var(--warning)';
  return 'var(--danger)';
};

export default function AnalisePage() {
  const { datadogSite } = useApp();
  const [apiKey, setApiKey]   = useState('');
  const [appKey, setAppKey]   = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');
  const [result, setResult]   = useState(null);
  const [rawData, setRawData] = useState(null);

  const runAnalysis = async () => {
    if (!apiKey || !appKey) {
      setError('Informe a API Key e a APP Key do Datadog.');
      return;
    }
    setError('');
    setLoading(true);
    setResult(null);

    try {
      const base = `https://api.${datadogSite}`;

      const [monitorsRes, hostsRes] = await Promise.all([
        fetch(`${base}/api/v1/monitor?page_size=200`, {
          headers: { 'DD-API-KEY': apiKey, 'DD-APPLICATION-KEY': appKey },
        }),
        fetch(`${base}/api/v1/hosts?count=200`, {
          headers: { 'DD-API-KEY': apiKey, 'DD-APPLICATION-KEY': appKey },
        }),
      ]);

      if (!monitorsRes.ok) throw new Error(`Erro na API do Datadog: ${monitorsRes.status} – verifique suas chaves e o site selecionado (${datadogSite}).`);

      const monitors = await monitorsRes.json();
      const hostsData = hostsRes.ok ? await hostsRes.json() : { host_list: [] };
      const hosts = hostsData.host_list || [];

      const payload = JSON.stringify({
        monitors_count: monitors.length,
        monitors_sample: monitors.slice(0, 30).map(m => ({
          id: m.id,
          name: m.name,
          type: m.type,
          status: m.overall_state,
          tags: m.tags,
          message: m.message?.slice(0, 200),
          no_data_timeframe: m.options?.no_data_timeframe,
          notify_no_data: m.options?.notify_no_data,
          thresholds: m.options?.thresholds,
        })),
        hosts_count: hosts.length,
        hosts_sample: hosts.slice(0, 20).map(h => ({
          name: h.host_name,
          tags: h.tags_by_source,
          up: h.up,
          apps: h.apps,
        })),
        site: datadogSite,
      });

      setRawData({ monitors_count: monitors.length, hosts_count: hosts.length });

      const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6',
          max_tokens: 1000,
          messages: [{
            role: 'user',
            content: `Você é um especialista em observabilidade com Datadog. Analise os dados abaixo e retorne um relatório ESTRUTURADO com exatamente estas 4 seções:

**Saúde de Configuração: [0-100]**
- liste os problemas encontrados (monitors sem threshold, sem notify_no_data, etc)

**Ruído Operacional: [0-100]**
- liste os problemas (monitors em ALERT há muito tempo, ausência de silencing, muitos monitors no mesmo recurso)

**Cobertura: [0-100]**
- liste as lacunas (hosts sem monitors associados, tipos de monitor ausentes, etc)

**Governança de Tags: [0-100]**
- liste os problemas (tags inconsistentes, monitors sem tags, hosts sem tags de env/service/team)

**Resumo:**
Escreva 2-3 frases resumindo o estado geral do ambiente.

Scores: 100 = perfeito, 0 = crítico. Seja objetivo e técnico.

DADOS:
${payload}`,
          }],
        }),
      });

      const claudeData = await claudeRes.json();
      const text = claudeData.content?.[0]?.text || '';
      setResult(parseAnalysis(text));

    } catch (err) {
      setError(err.message || 'Erro ao conectar com o Datadog.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: 760 }}>
      <div style={{ marginBottom: '2rem' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--text-primary)', marginBottom: 4 }}>
          Análise do Ambiente
        </h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
          Avalia a saúde, ruído, cobertura e governança de tags do seu Datadog.{' '}
          <span style={{ color: 'var(--accent)', fontWeight: 600 }}>Site: {datadogSite}</span>
        </p>
      </div>

      {/* Credenciais */}
      <div style={{
        background: 'var(--bg-surface)',
        border: '1px solid var(--border)',
        borderRadius: 12,
        padding: '1.5rem',
        marginBottom: '1.25rem',
      }}>
        <h2 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '0.25rem', color: 'var(--text-primary)' }}>
          Credenciais
        </h2>
        <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
          As chaves são usadas apenas nesta sessão, nunca armazenadas.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          {[
            { label: 'API Key', value: apiKey, set: setApiKey, placeholder: 'dd_api_key_...' },
            { label: 'APP Key', value: appKey, set: setAppKey, placeholder: 'dd_app_key_...' },
          ].map(({ label, value, set, placeholder }) => (
            <div key={label}>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 5 }}>
                {label}
              </label>
              <input
                type="password"
                value={value}
                onChange={e => set(e.target.value)}
                placeholder={placeholder}
                style={{
                  width: '100%', padding: '0.6rem 0.75rem',
                  background: 'var(--bg-surface-2)', border: '1px solid var(--border)',
                  borderRadius: 7, color: 'var(--text-primary)', fontSize: '0.875rem', outline: 'none',
                }}
              />
            </div>
          ))}
        </div>

        {error && (
          <div style={{
            marginTop: 12, padding: '0.6rem 0.875rem',
            background: 'rgba(214,59,59,0.08)', border: '1px solid rgba(214,59,59,0.25)',
            borderRadius: 7, color: 'var(--danger)', fontSize: '0.85rem',
          }}>
            {error}
          </div>
        )}

        <button
          onClick={runAnalysis}
          disabled={loading}
          style={{
            marginTop: 14,
            padding: '0.65rem 1.75rem',
            background: loading ? 'var(--text-muted)' : 'var(--accent)',
            color: 'white', border: 'none', borderRadius: 8,
            fontWeight: 600, fontSize: '0.9375rem',
            cursor: loading ? 'not-allowed' : 'pointer',
            display: 'flex', alignItems: 'center', gap: 8,
          }}
        >
          {loading && (
            <span style={{
              width: 14, height: 14,
              border: '2px solid rgba(255,255,255,0.3)',
              borderTopColor: 'white',
              borderRadius: '50%',
              display: 'inline-block',
              animation: 'spin 0.8s linear infinite',
            }} />
          )}
          {loading ? 'Analisando...' : 'Rodar Análise'}
        </button>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>

      {/* Resultado */}
      {result && rawData && (
        <>
          <div style={{
            background: 'var(--accent-light)',
            border: '1px solid var(--accent)',
            borderRadius: 12,
            padding: '1.25rem',
            marginBottom: '1.25rem',
          }}>
            <p style={{ fontSize: '0.8125rem', fontWeight: 700, color: 'var(--accent)', marginBottom: 6 }}>
              📊 {rawData.monitors_count} monitors · {rawData.hosts_count} hosts analisados
            </p>
            <p style={{ fontSize: '0.9rem', color: 'var(--text-primary)', lineHeight: 1.6 }}>
              {result.resumo}
            </p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            {[
              {
                key: 'saude',
                title: 'Saúde de Configuração',
                description: 'Qualidade das definições dos monitors: thresholds, notificações, timeframes.',
              },
              {
                key: 'ruido',
                title: 'Ruído Operacional',
                description: 'Volume de alertas desnecessários que dificultam a triagem de incidentes.',
              },
              {
                key: 'cobertura',
                title: 'Cobertura',
                description: 'Percentual do ambiente monitorado — hosts, serviços e métricas críticas.',
              },
              {
                key: 'governanca',
                title: 'Governança de Tags',
                description: 'Consistência e completude das tags em monitors e hosts.',
              },
            ].map(({ key, title, description }) => {
              const d = result[key];
              const val = d?.score ?? 0;
              return (
                <MetricCard
                  key={key}
                  title={title}
                  value={val}
                  color={SCORE_COLOR(val)}
                  description={description}
                  issues={d?.issues || []}
                />
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}