import React from "react";
import { ScrollViewStyleReset } from "expo-router/html";
import { type PropsWithChildren } from "react";

/**
 * +html.tsx — Web shell global do BLACKSCLUB.
 *
 * PRINCÍPIO: O shell web NÃO aplica safe-area nem max-width. Cada tela usa SafeAreaView
 * (react-native-safe-area-context) e isso já resolve o iPhone com notch. Aplicar safe-area
 * AQUI + na tela = padding duplicado → conteúdo comprimido. NÃO FAZER.
 */
export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="pt-BR">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
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
        <meta name="description" content="BLACKSCLUB · Clube privado de performance, saúde e marketplace premium." />
        <meta property="og:title" content="BLACKSCLUB" />
        <meta property="og:description" content="Clube privado. Acesso restrito." />
        <meta property="og:type" content="website" />
        <meta property="og:locale" content="pt_BR" />
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
    icons: [
      { src: "/assets/images/icon.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/assets/images/icon.png", sizes: "512x512", type: "image/png", purpose: "any maskable" },
    ],
  };
  return "data:application/manifest+json;charset=utf-8," + encodeURIComponent(JSON.stringify(manifest));
}

/**
 * CSS global — MÍNIMO E NÃO-INVASIVO.
 *
 * - SEM max-width no #root (app ocupa 100% da tela em qualquer dispositivo)
 * - SEM padding de safe-area no #root (SafeAreaView local já faz isso)
 * - SEM position:relative redundante
 * - Altura via 100dvh em html/body/#root (fallback 100vh)
 * - overscroll-behavior: none e touch-action: manipulation para sensação de app nativo
 */
const globalCss = `
html, body {
  margin: 0;
  padding: 0;
  background-color: #050505;
  color: #FFFFFF;
  min-height: 100vh;
  min-height: 100dvh;
  width: 100%;
  -webkit-text-size-adjust: 100%;
  -webkit-tap-highlight-color: transparent;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  overscroll-behavior: none;
  touch-action: manipulation;
  overflow-x: hidden;
}

#root {
  display: flex;
  flex-direction: column;
  width: 100%;
  min-height: 100vh;
  min-height: 100dvh;
  background-color: #050505;
}

#root > * {
  flex: 1;
  width: 100%;
  min-height: 0;
  background-color: #050505;
}

/*
 * Em telas >= 600px (desktop/tablet) centraliza o app dentro de uma moldura
 * de 430px (tamanho típico de mobile) para não esticar horizontalmente.
 * Em telas < 600px (mobile real), ocupa 100% naturalmente. NÃO adiciona padding
 * nem bordas — o app continua colado nas bordas do device real.
 */
@media (min-width: 600px) {
  #root { align-items: center; }
  #root > * {
    max-width: 430px;
    min-height: 100dvh;
  }
}

* { -webkit-user-select: none; user-select: none; }
input, textarea, [contenteditable="true"] {
  -webkit-user-select: text; user-select: text;
}

*:focus { outline: none; }
*:focus-visible { outline: 2px solid #F5C150; outline-offset: 2px; }

img { -webkit-user-drag: none; }

*::-webkit-scrollbar { width: 0; height: 0; }
*::-webkit-scrollbar-thumb { background: transparent; }
*::-webkit-scrollbar-track { background: transparent; }
`;
