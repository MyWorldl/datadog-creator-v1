'use client'

import { useState } from 'react';
import { useApp } from '@/context/AppContext';
import ConnectKeysCard from '@/components/ConnectKeysCard';

const DD_SITES = [
  { value: 'datadoghq.com',     label: 'datadoghq.com — US1' },
  { value: 'us3.datadoghq.com', label: 'us3.datadoghq.com — US3' },
  { value: 'us5.datadoghq.com', label: 'us5.datadoghq.com — US5' },
  { value: 'datadoghq.eu',      label: 'datadoghq.eu — EU' },
  { value: 'ap1.datadoghq.com', label: 'ap1.datadoghq.com — AP1' },
  { value: 'ddog-gov.com',      label: 'ddog-gov.com — US1-FED' },
];

const s = {
  title:      { fontSize: 20, fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 4px' },
  sub:        { fontSize: 13, color: 'var(--text-muted)', margin: '0 0 1.5rem' },
  card:       { background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '1.25rem', marginBottom: 12, boxShadow: 'var(--card-shadow)' },
  cardTitle:  { fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 12px' },
  label:      { fontSize: 12, color: 'var(--text-muted)', marginBottom: 5, display: 'block' },
  input:      { width: '100%', fontSize: 13, padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 8, outline: 'none', boxSizing: 'border-box', background: 'var(--bg-surface-2)', color: 'var(--text-primary)' },
  select:     { width: '100%', fontSize: 13, padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 8, outline: 'none', boxSizing: 'border-box', background: 'var(--bg-surface-2)', color: 'var(--text-primary)' },
  row2:       { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 },
  saved:      { fontSize: 12, color: 'var(--success)', background: 'var(--success-bg)', padding: '6px 12px', borderRadius: 8 },
  btnPrimary: { fontSize: 13, fontWeight: 600, color: '#fff', background: 'var(--accent)', border: 'none', borderRadius: 8, padding: '8px 16px', cursor: 'pointer' },
};

export default function ConfiguracoesPage() {
  const { theme, setTheme } = useApp();

  const [saved, setSaved]   = useState(false);
  const [config, setConfig] = useState({
    site:        'datadoghq.com',
    algorithm:   'agile',
    seasonality: 'daily',
    deviations:  '2',
    alertWindow: 'last_15m',
    priority:    '3',
    tags:        'env:prod',
    message:     'Anomalia detectada! @equipe-ops',
  });

  function set(key) {
    return e => setConfig(c => ({ ...c, [key]: e.target.value }));
  }

  function handleSave() {
    localStorage.setItem('wizard-defaults', JSON.stringify(config));
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  }

  return (
    <div>
      <h1 style={s.title}>Configurações</h1>
      <p style={s.sub}>Tema, conexão da sessão e valores padrão do Wizard.</p>

      {/* ── TEMA ── */}
      <div style={s.card}>
        <p style={s.cardTitle}>Tema</p>
        <div style={{ display: 'flex', gap: 10 }}>
          {[
            { value: 'light', label: 'Light', icon: '☀️' },
            { value: 'dark',  label: 'Dark',  icon: '🌙' },
          ].map(opt => (
            <button
              key={opt.value}
              onClick={() => setTheme(opt.value)}
              style={{
                flex: 1, padding: '10px 14px', cursor: 'pointer',
                borderRadius: 8, textAlign: 'left', fontSize: 13,
                background: theme === opt.value ? 'var(--accent-light)' : 'var(--bg-surface-2)',
                border: `1.5px solid ${theme === opt.value ? 'var(--accent)' : 'var(--border)'}`,
                color: theme === opt.value ? 'var(--accent)' : 'var(--text-secondary)',
                fontWeight: theme === opt.value ? 600 : 400,
              }}
            >
              {opt.icon} {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── CONEXÃO DA SESSÃO (item 5) ── */}
      <div style={{ marginBottom: 12 }}>
        <ConnectKeysCard />
      </div>

      {/* ── PADRÕES DO MONITOR ── */}
      <div style={s.card}>
        <p style={s.cardTitle}>Padrões do monitor</p>
        <div style={s.row2}>
          <div>
            <label style={s.label}>Site padrão (sugestão para o wizard)</label>
            <select style={s.select} value={config.site} onChange={set('site')}>
              {DD_SITES.map(site => (
                <option key={site.value} value={site.value}>{site.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label style={s.label}>Algoritmo</label>
            <select style={s.select} value={config.algorithm} onChange={set('algorithm')}>
              <option value="basic">basic</option>
              <option value="agile">agile</option>
              <option value="robust">robust</option>
            </select>
          </div>
          <div>
            <label style={s.label}>Sazonalidade</label>
            <select style={s.select} value={config.seasonality} onChange={set('seasonality')}>
              <option value="hourly">hourly</option>
              <option value="daily">daily</option>
              <option value="weekly">weekly</option>
            </select>
          </div>
          <div>
            <label style={s.label}>Desvios</label>
            <select style={s.select} value={config.deviations} onChange={set('deviations')}>
              <option value="1">1 — sensível</option>
              <option value="2">2 — balanceado</option>
              <option value="3">3 — conservador</option>
            </select>
          </div>
          <div>
            <label style={s.label}>Alert window</label>
            <select style={s.select} value={config.alertWindow} onChange={set('alertWindow')}>
              <option value="last_5m">last_5m</option>
              <option value="last_15m">last_15m</option>
              <option value="last_30m">last_30m</option>
              <option value="last_1h">last_1h</option>
            </select>
          </div>
          <div>
            <label style={s.label}>Prioridade</label>
            <select style={s.select} value={config.priority} onChange={set('priority')}>
              <option value="1">P1 — crítico</option>
              <option value="2">P2 — alto</option>
              <option value="3">P3 — médio</option>
              <option value="4">P4 — baixo</option>
            </select>
          </div>
          <div>
            <label style={s.label}>Tags padrão</label>
            <input style={s.input} value={config.tags} onChange={set('tags')} placeholder="env:prod" />
          </div>
        </div>
        <div style={{ marginTop: 12 }}>
          <label style={s.label}>Mensagem padrão</label>
          <textarea
            value={config.message}
            onChange={set('message')}
            style={{ ...s.input, resize: 'vertical', minHeight: 72, fontFamily: 'inherit', lineHeight: 1.5 }}
          />
        </div>
      </div>

      {/* ── AÇÕES ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, justifyContent: 'flex-end' }}>
        {saved && <span style={s.saved}>Salvo com sucesso!</span>}
        <button style={s.btnPrimary} onClick={handleSave}>
          Salvar alterações
        </button>
      </div>
    </div>
  );
}
