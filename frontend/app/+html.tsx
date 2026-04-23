import React from "react";
import { ScrollViewStyleReset } from "expo-router/html";
import { type PropsWithChildren } from "react";

/**
 * +html.tsx — Web shell global do BLACKSCLUB.
 * Garante comportamento SPA + PWA standalone + safe-area iOS.
 * NÃO alterar sem entender o impacto em todas as telas.
 */
export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="pt-BR">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        {/* Viewport compatível com iPhone com notch/Dynamic Island */}
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover"
        />
        {/* PWA / Standalone */}
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="BLACKSCLUB" />
        <meta name="application-name" content="BLACKSCLUB" />
        <meta name="theme-color" content="#050505" />
        <meta name="color-scheme" content="dark" />
        <meta name="google" content="notranslate" />
        <meta httpEquiv="Content-Language" content="pt-BR" />
        {/* Preview social / OG */}
        <meta name="description" content="BLACKSCLUB · Clube privado de performance, saúde e marketplace premium." />
        <meta property="og:title" content="BLACKSCLUB" />
        <meta property="og:description" content="Clube privado. Acesso restrito." />
        <meta property="og:type" content="website" />
        <meta property="og:locale" content="pt_BR" />
        {/* Manifest PWA (inline data URL para funcionar sem arquivo externo) */}
        <link rel="manifest" href={manifestDataUrl()} />
        <link rel="apple-touch-icon" href="/assets/images/icon.png" />
        <link rel="icon" type="image/png" href="/assets/images/favicon.png" />
        <title>BLACKSCLUB</title>
        <ScrollViewStyleReset />
        <style dangerouslySetInnerHTML={{ __html: globalCss }} />
      </head>
      <body translate="no">{children}</body>
    </html>
  );
}

/**
 * Manifest injetado inline (data URL) — garante modo standalone
 * mesmo sem servir um manifest.json físico.
 */
function manifestDataUrl() {
  const manifest = {
    name: "BLACKSCLUB",
    short_name: "BLACKSCLUB",
    description: "Clube privado de performance, saúde e marketplace premium.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#050505",
    theme_color: "#050505",
    lang: "pt-BR",
    dir: "ltr",
    categories: ["lifestyle", "health", "social"],
    icons: [
      { src: "/assets/images/icon.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/assets/images/icon.png", sizes: "512x512", type: "image/png", purpose: "any maskable" },
    ],
  };
  return "data:application/manifest+json;charset=utf-8," + encodeURIComponent(JSON.stringify(manifest));
}

/**
 * CSS global do App Shell.
 * - Background e altura consistente em todas telas
 * - Safe-area-inset para iPhone
 * - 100dvh em vez de 100vh (evita corte na barra do browser)
 * - Overscroll desativado (sem "pull-to-refresh" do browser)
 * - touch-action: manipulation → remove delay de 300ms no toque
 */
const globalCss = `
:root {
  --bsc-bg: #050505;
  --bsc-shell-max: 560px;
  --safe-top: env(safe-area-inset-top, 0px);
  --safe-bottom: env(safe-area-inset-bottom, 0px);
  --safe-left: env(safe-area-inset-left, 0px);
  --safe-right: env(safe-area-inset-right, 0px);
}

html, body, #root {
  background-color: var(--bsc-bg) !important;
  margin: 0;
  padding: 0;
  min-height: 100vh;
  min-height: 100dvh;
  height: 100%;
  -webkit-text-size-adjust: 100%;
  -webkit-tap-highlight-color: transparent;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  overscroll-behavior: none;
  overscroll-behavior-y: contain;
  touch-action: manipulation;
}

body {
  overflow-x: hidden;
}

#root {
  display: flex;
  justify-content: center;
  width: 100%;
  min-height: 100dvh;
}

#root > * {
  width: 100%;
  max-width: var(--bsc-shell-max);
  min-height: 100dvh;
  position: relative;
}

/* Modo standalone (PWA instalado): aplica padding extra da safe-area */
@media all and (display-mode: standalone) {
  #root > * {
    padding-top: var(--safe-top);
    padding-bottom: var(--safe-bottom);
    padding-left: var(--safe-left);
    padding-right: var(--safe-right);
    box-sizing: border-box;
  }
}

/* Impede seleção indesejada em touch UIs */
* {
  -webkit-user-select: none;
  user-select: none;
}
input, textarea, [contenteditable="true"] {
  -webkit-user-select: text;
  user-select: text;
}

/* Remove outlines em web mantendo acessibilidade via keyboard focus-visible */
*:focus { outline: none; }
*:focus-visible { outline: 2px solid #F5C150; outline-offset: 2px; }

/* Evita "bounce" do scroll no iOS dentro do shell */
html, body { position: relative; }

/* Image rendering suave */
img { -webkit-user-drag: none; }

/* Scrollbar discreto */
*::-webkit-scrollbar { width: 6px; height: 6px; }
*::-webkit-scrollbar-thumb { background: #222; border-radius: 3px; }
*::-webkit-scrollbar-track { background: transparent; }
`;
