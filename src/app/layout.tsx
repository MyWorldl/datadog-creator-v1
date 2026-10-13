import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Geist, Geist_Mono } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import "./globals.css";
import Providers from '@/components/Providers';
import AppShell from '@/components/AppShell';

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: 'Datadog Creator',
  description: 'Crie Monitores, dashboards e investigue o seu ambiente Datadog',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="pt-BR"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      // data-theme é definido pelo script abaixo ANTES da hidratação.
      suppressHydrationWarning
    >
      <head>
        {/* Aplica o tema salvo na PRIMEIRA pintura — sem isso a página nascia
            no tema claro (padrão do CSS) e piscava pro escuro depois que o
            React hidratava. Mesma lógica de AppContext (dd_theme / system). */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var t=localStorage.getItem('dd_theme')||'system';var d=t==='system'?window.matchMedia('(prefers-color-scheme: dark)').matches:t==='dark';document.documentElement.setAttribute('data-theme',d?'dark':'light')}catch(e){}`,
          }}
        />
      </head>
      <body className="h-full">
        <Providers>
          <AppShell>{children}</AppShell>
        </Providers>
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
