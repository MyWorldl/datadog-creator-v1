// src/lib/app-version.js
//
// HISTÓRICO DE VERSÕES — fonte única de verdade.
//
// Como usar a cada deploy:
//   1. Adicione uma nova entrada NO TOPO do array VERSION_HISTORY
//      (versão, data, título e a lista do que mudou).
//   2. Pronto: a página "Sobre" (Sistema -> Sobre) e o APP_VERSION
//      passam a refletir a versão nova.
//
// Dica (automação opcional): em deploys na Vercel, o commit é exposto via
// variável de ambiente. Mostramos o SHA automaticamente quando disponível
// (veja COMMIT_SHA abaixo), mas a versão "humana" e a descrição continuam
// vindo daqui, porque descrevem O QUE mudou — algo que só você sabe.

export const VERSION_HISTORY = [
  {
    version: '1.3.0',
    date: '2026-06-30',
    title: 'Anomaly detection, ScopeMaturity e correções',
    notes: [
      'Descoberta agora cria monitores de ANOMALY DETECTION (latência, erro, alto/baixo volume).',
      'Seleção de múltiplas operations por serviço.',
      'Etapa 3: nome do monitor (prefixo) e Tags dos monitores.',
      'ScopeMaturity (ex-"Análise do Ambiente"): score 0–100 calculado no servidor.',
      'Corrigido "Failed to fetch": a análise agora coleta no servidor (sem CORS).',
      'Dashboard: removido o card de Conexão Datadog.',
      'Adicionados Vercel Analytics e Speed Insights.',
    ],
  },
  {
    version: '1.2.0',
    date: '2026-06-30',
    title: 'Descoberta por serviço + wizard completo',
    notes: [
      'Descoberta agora é por serviço (multi-seleção) e mostra quantas operations cada serviço tem.',
      'Alertas de serviço passam pelas 5 etapas do wizard (criação só na Etapa 5).',
      'Etapa 3: seleção de Group By (padrão service, resource_name).',
      'Etapa 3: mensagens-template editáveis, com padrão por tipo de alerta.',
      'Tema "Sistema" (segue o SO) e correção do logo sumindo no tema claro.',
      'Suporte a múltiplos usuários via AUTH_USERS.',
      '"Testar conexão" reposicionado à direita de "Reconfigurar".',
    ],
  },
  {
    version: '1.1.1',
    date: '2026-06-30',
    title: 'Diagnóstico de credenciais',
    notes: [
      'Botão "Testar conexão" em Configurações (valida API + App Key via /api/v2/validate_keys).',
      'Descoberta de serviços agora mostra a mensagem real do Datadog (ex.: 401 = API key inválida ou site errado).',
    ],
  },
  {
    version: '1.1.0',
    date: '2026-06-30',
    title: 'Descoberta de serviços + Analytics + Sobre',
    notes: [
      'MonitorsCreator: descoberta automática de serviços APM e criação de alertas de Latência, Taxa de Erro, Baixo e Alto volume de requisições.',
      'Adicionada integração com Vercel Web Analytics.',
      'Nova página Sistema → Sobre com histórico de versões.',
      'Configurações: removido o bloco "Padrões do monitor".',
    ],
  },
  {
    version: '1.0.1',
    date: '2026-06-30',
    title: 'Correções de fluxo de login',
    notes: [
      'Corrigido loop de redirecionamento para usuários não autenticados.',
      'Resumo do wizard agora mostra o site real da sessão.',
      'Adicionado trustHost no Auth.js para deploys fora da Vercel.',
    ],
  },
  {
    version: '1.0.0',
    date: '2026-06-25',
    title: 'Primeira versão com autenticação e sessão',
    notes: [
      'Tema claro/escuro em todo o app.',
      '"Monitores" renomeado para MonitorsCreator.',
      'Novo Dashboard como tela inicial.',
      'Autenticação real (Auth.js v5 + bcrypt).',
      'API/App Key em cookie httpOnly por sessão.',
    ],
  },
]

// Versão atual = a entrada mais recente do histórico.
export const APP_VERSION = VERSION_HISTORY[0]?.version ?? '0.0.0'

// SHA do commit, se o deploy expôs (ex.: Vercel). Opcional.
export const COMMIT_SHA =
  process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA?.slice(0, 7) || null
