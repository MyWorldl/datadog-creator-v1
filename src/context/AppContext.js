'use client';
/* eslint-disable react-hooks/set-state-in-effect --
   Os efeitos abaixo são intencionais: (1) hidratar tema/site do localStorage
   no mount (não existe no SSR) e (2) buscar o status das chaves no servidor
   ao logar. São sincronizações com sistemas externos, não loops de render. */

import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useSession } from 'next-auth/react';

const AppContext = createContext(null);

export function AppProvider({ children }) {
  // Auth NÃO vive mais aqui — quem cuida do login é o Auth.js (useSession).
  // Este context guarda só preferências de UI e o estado da conexão Datadog.
  // theme = escolha do usuário: 'light' | 'dark' | 'system'
  const [theme, setTheme] = useState('system');
  const [datadogSite, setDatadogSite] = useState('datadoghq.com');

  // Flag: as chaves da sessão estão configuradas? (item 5)
  // A chave em si fica em cookie httpOnly no servidor; aqui guardamos só
  // o "booleano" + o site, que não são segredos.
  const [keysConfigured, setKeysConfigured] = useState(false);
  const [keysLoading, setKeysLoading] = useState(true);

  // Carrega preferências locais (tema/site NÃO são segredos => localStorage ok).
  // Lido em efeito de propósito: o localStorage não existe no SSR, então fazer
  // isso no mount evita divergência de hidratação.
  useEffect(() => {
    const savedTheme = localStorage.getItem('dd_theme') || 'system';
    const savedSite = localStorage.getItem('dd_site') || 'datadoghq.com';
    setTheme(savedTheme);
    setDatadogSite(savedSite);
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

  // Pergunta ao servidor se as chaves da sessão estão configuradas
  const refreshKeys = useCallback(async () => {
    try {
      const r = await fetch('/api/session/keys');
      if (!r.ok) { setKeysConfigured(false); return; }
      const data = await r.json();
      setKeysConfigured(!!data.configured);
      if (data.site) {
        setDatadogSite(data.site);
        localStorage.setItem('dd_site', data.site);
      }
    } catch {
      setKeysConfigured(false);
    } finally {
      setKeysLoading(false);
    }
  }, []);

  // A consulta das chaves é disparada pela sessão abaixo (no login), evitando
  // um fetch desnecessário antes de estar autenticado.

  // Quando o login acontece (sessão vira "authenticated"), consulta as chaves.
  // Fetch-on-login é justamente um efeito de sincronização com o servidor.
  const { status } = useSession();
  useEffect(() => {
    if (status === 'authenticated') {
      refreshKeys();
    } else if (status === 'unauthenticated') {
        setKeysConfigured(false);
        setKeysLoading(false);
    }
  }, [status, refreshKeys]);

  const saveSite = (site) => {
    setDatadogSite(site);
    localStorage.setItem('dd_site', site);
  };

  return (
    <AppContext.Provider value={{
      theme, setTheme,
      datadogSite, saveSite,
      keysConfigured, keysLoading, refreshKeys, setKeysConfigured,
    }}>
      {children}
    </AppContext.Provider>
  );
}

export const useApp = () => {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used inside AppProvider');
  return ctx;
};
