'use client';
/* eslint-disable react-hooks/set-state-in-effect --
   Os efeitos abaixo são intencionais: (1) hidratar tema/site do localStorage
   no mount (não existe no SSR) e (2) buscar as conexões Datadog do usuário
   ao logar. São sincronizações com sistemas externos, não loops de render. */

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import { useSession } from '@/context/SupabaseAuthContext';
import type { PublicConnection } from '@/lib/connections';
import { FEATURE_FLAG_KEYS, type FeatureFlagState } from '@/lib/feature-flags';

const ALL_FEATURES_OFF: FeatureFlagState = Object.fromEntries(
  FEATURE_FLAG_KEYS.map(flag => [flag, false])
) as FeatureFlagState;

export type Theme = 'system' | 'light' | 'dark';

export interface AddConnectionInput {
  name?: string
  apiKey: string
  appKey: string
  site: string
}

export interface AppContextValue {
  theme: Theme
  setTheme: (t: Theme) => void
  datadogSite: string
  keysConfigured: boolean
  keysLoading: boolean
  connections: PublicConnection[]
  activeConnection: PublicConnection | null
  refreshConnections: () => Promise<void>
  activateConnection: (id: string) => Promise<void>
  addConnection: (input: AddConnectionInput) => Promise<PublicConnection | undefined>
  removeConnection: (id: string) => Promise<void>
  setKeysConfigured: () => void
  features: FeatureFlagState
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  // Auth NÃO vive mais aqui — quem cuida do login é o Supabase Auth (useSession).
  // Este context guarda preferências de UI + as conexões Datadog (múltiplas
  // orgs, guardadas no Supabase — ver lib/connections.ts) do usuário.
  const [theme, setTheme] = useState<Theme>('system');
  const [datadogSite, setDatadogSite] = useState('datadoghq.com');

  // Lista de conexões (orgs) do usuário + qual está ativa no momento.
  // As chaves em si NUNCA chegam ao browser — só id/nome/site/isActive.
  const [connections, setConnections] = useState<PublicConnection[]>([]);
  const [keysLoading, setKeysLoading] = useState(true);

  // Feature flags (ver lib/feature-flags.ts) — fail-closed: começa tudo
  // desligado até a resposta de /api/feature-flags chegar (ou pra sempre,
  // se a chamada falhar), nunca "tudo ligado" por padrão.
  const [features, setFeatures] = useState<FeatureFlagState>(ALL_FEATURES_OFF);

  const activeConnection = connections.find(c => c.isActive) || null;
  const keysConfigured = !!activeConnection;

  // Carrega preferências locais (tema NÃO é segredo => localStorage ok).
  useEffect(() => {
    const savedTheme = (localStorage.getItem('dd_theme') as Theme) || 'system';
    setTheme(savedTheme);
  }, []);

  // Aplica o tema no <html> e persiste. Quando a escolha é 'system',
  // resolvemos pela preferência do SO (prefers-color-scheme) e reagimos
  // a mudanças do sistema em tempo real.
  useEffect(() => {
    localStorage.setItem('dd_theme', theme);

    const mql = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      const resolved = theme === 'system' ? (mql.matches ? 'dark' : 'light') : theme;
      document.documentElement.setAttribute('data-theme', resolved);
    };
    apply();

    if (theme === 'system') {
      mql.addEventListener('change', apply);
      return () => mql.removeEventListener('change', apply);
    }
  }, [theme]);

  // Busca as conexões do usuário no servidor.
  const refreshConnections = useCallback(async () => {
    try {
      const r = await fetch('/api/connections');
      if (!r.ok) { setConnections([]); return; }
      const data = await r.json();
      const list: PublicConnection[] = Array.isArray(data.connections) ? data.connections : [];
      setConnections(list);
      const active = list.find(c => c.isActive);
      if (active?.site) setDatadogSite(active.site);
    } catch {
      setConnections([]);
    } finally {
      setKeysLoading(false);
    }
  }, []);

  // Busca o estado das feature flags no servidor (fail-closed: qualquer
  // falha mantém tudo desligado, nunca libera por engano).
  const refreshFeatures = useCallback(async () => {
    try {
      const r = await fetch('/api/feature-flags');
      if (!r.ok) { setFeatures(ALL_FEATURES_OFF); return; }
      const data = await r.json();
      setFeatures({ ...ALL_FEATURES_OFF, ...data.flags });
    } catch {
      setFeatures(ALL_FEATURES_OFF);
    }
  }, []);

  // Quando o login acontece (sessão vira "authenticated"), busca as conexões
  // e as feature flags.
  const { status } = useSession();
  useEffect(() => {
    if (status === 'authenticated') {
      refreshConnections();
      refreshFeatures();
    } else if (status === 'unauthenticated') {
      setConnections([]);
      setKeysLoading(false);
      setFeatures(ALL_FEATURES_OFF);
    }
  }, [status, refreshConnections, refreshFeatures]);

  // Troca a org ativa (marca outra conexão salva como ativa).
  const activateConnection = useCallback(async (id: string) => {
    const r = await fetch(`/api/connections/${id}`, { method: 'PATCH' });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.error || 'Falha ao trocar de org.');
    await refreshConnections();
  }, [refreshConnections]);

  // Adiciona uma nova org (a rota já valida as chaves contra o Datadog).
  const addConnection = useCallback(async ({ name, apiKey, appKey, site }: AddConnectionInput) => {
    const r = await fetch('/api/connections', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, apiKey, appKey, site }),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.error || 'Falha ao salvar a conexão.');
    await refreshConnections();
    return data.connection;
  }, [refreshConnections]);

  // Remove uma org salva.
  const removeConnection = useCallback(async (id: string) => {
    const r = await fetch(`/api/connections/${id}`, { method: 'DELETE' });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.error || 'Falha ao remover a conexão.');
    await refreshConnections();
  }, [refreshConnections]);

  // Usado só no logout, pra limpar o estado local imediatamente (a fonte de
  // verdade — o Supabase — não é afetada; as orgs salvas continuam lá pro
  // próximo login).
  const clearLocalKeysState = useCallback(() => {
    setConnections([]);
  }, []);

  return (
    <AppContext.Provider value={{
      theme, setTheme,
      datadogSite,
      keysConfigured, keysLoading,
      connections, activeConnection,
      refreshConnections, activateConnection, addConnection, removeConnection,
      setKeysConfigured: clearLocalKeysState, // compat: só reseta estado local
      features,
    }}>
      {children}
    </AppContext.Provider>
  );
}

export const useApp = (): AppContextValue => {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used inside AppProvider');
  return ctx;
};
