import React from "react";
import { ScrollViewStyleReset } from "expo-router/html";
import { type PropsWithChildren } from "react";

/**
 * +html.tsx — Web shell global do BLACKSCLUB.
 * PRINCÍPIO: App ocupa 100% da tela SEMPRE. Safe-area é feita pelas telas via SafeAreaView.
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
 * CSS global — ocupa 100% SEMPRE. Zero bordas, zero max-width, zero outlines.
 */
const globalCss = `
html, body {
  margin: 0;
  padding: 0;
  background-color: #050505 !important;
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
  border: 0 !important;
  outline: 0 !important;
  box-shadow: none !important;
}

#root {
  display: flex;
  flex-direction: column;
  width: 100%;
  min-height: 100vh;
  min-height: 100dvh;
  background-color: #050505 !important;
  border: 0 !important;
  outline: 0 !important;
  box-shadow: none !important;
}

#root > * {
  flex: 1;
  width: 100%;
  min-height: 0;
  background-color: #050505;
  border: 0 !important;
  outline: 0 !important;
  box-shadow: none !important;
}

/* Mata QUALQUER borda fantasma de wrappers do expo-router/react-navigation.
 * Aplica APENAS a elementos que NÃO são componentes React Native com borda intencional
 * (RN vira inline style, que prevalece). Isso mata wrappers de navegação e ScrollViews. */
div[role="tablist"], div[role="tab"], div[role="tabpanel"], div[role="presentation"] {
  border: 0 !important;
  outline: 0 !important;
  box-shadow: none !important;
}

* { -webkit-user-select: none; user-select: none; box-sizing: border-box; }
input, textarea, [contenteditable="true"] {
  -webkit-user-select: text; user-select: text;
}

*:focus { outline: none; }
*:focus-visible { outline: 2px solid #F5C150; outline-offset: 2px; }

img { -webkit-user-drag: none; }

*::-webkit-scrollbar { width: 0 !important; height: 0 !important; display: none; }
*::-webkit-scrollbar-thumb { background: transparent; }
*::-webkit-scrollbar-track { background: transparent; }
html { scrollbar-width: none; -ms-overflow-style: none; }
`;
