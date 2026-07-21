/**
 * Helpers para a moeda PYX Token (PYX).
 * Armazenamos o saldo em CENTAVOS (int). 1 PYX = 100 centavos.
 * Usar SEMPRE estas funções para formatar/parsear para evitar erro de ponto flutuante.
 */

/** Formata centavos -> "1.234" (apenas inteiro, SEM casas decimais — regra do BLACKSCLUB).
 *  Exemplo: 150000 centavos -> "1.500" · 100050 centavos -> "1.000" (arredondado).
 */
export function formatPYX(cents: number | null | undefined): string {
  const c = Math.round(Number(cents || 0));
  const whole = Math.round(Math.abs(c) / 100); // arredonda para inteiro mais próximo
  const sign = c < 0 ? "-" : "";
  return `${sign}${whole.toLocaleString("pt-BR")}`;
}

/** Formata centavos -> "1.234,56" (com decimais). Usado onde queremos mostrar centavos. */
export function formatPYXWithCents(cents: number | null | undefined): string {
  const c = Math.round(Number(cents || 0));
  const abs = Math.abs(c);
  const whole = Math.floor(abs / 100);
  const dec = String(abs % 100).padStart(2, "0");
  const sign = c < 0 ? "-" : "";
  return `${sign}${whole.toLocaleString("pt-BR")},${dec}`;
}

/** Retorna partes do valor PYX separadas: `{ int: "1.234", dec: "56", sign: "-" | "" }`. */
export function formatPYXParts(cents: number | null | undefined): { int: string; dec: string; sign: string } {
  const c = Math.round(Number(cents || 0));
  const abs = Math.abs(c);
  const whole = Math.floor(abs / 100);
  const dec = String(abs % 100).padStart(2, "0");
  return {
    int: whole.toLocaleString("pt-BR"),
    dec,
    sign: c < 0 ? "-" : "",
  };
}

/** Retorna partes do valor USx: `{ prefix: "USx ", int: "9.983", dec: "37", sign }`. */
export function formatUSxParts(
  pyxCentavos: number | null | undefined,
  rateCentavos: number | null | undefined,
  opts: { prefix?: string } = {},
): { prefix: string; int: string; dec: string; sign: string } {
  const usd = pyxCentavosToUSD(pyxCentavos, rateCentavos);
  const abs = Math.abs(usd);
  const sign = usd < 0 ? "-" : "";
  const prefix = opts.prefix ?? "USx ";
  const [intPart, decPart] = abs
    .toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    .split(",");
  return { prefix, int: intPart, dec: decPart || "00", sign };
}

/** Formato compacto — agora idêntico ao formatPYX (sem decimais). */
export function formatPYXShort(cents: number | null | undefined): string {
  return formatPYX(cents);
}

/** Converte string digitada (ex: "1.234,56" ou "1234.56") para centavos int. */
export function parsePYXToCents(s: string): number | null {
  if (!s) return null;
  const cleaned = String(s)
    .replace(/\s/g, "")
    .replace(/\.(?=\d{3}(\D|$))/g, "") // remove ponto de milhar
    .replace(",", ".");
  const n = Number(cleaned);
  if (!isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}

/**
 * Máscara dinâmica para input de valor PYX.
 * Recebe uma string qualquer e retorna formatada "1.234,56".
 * Funciona tipo caixa de banco: sempre 2 decimais, incrementa pela direita.
 */
export function maskPYXInput(raw: string): string {
  const digits = String(raw).replace(/\D/g, "").replace(/^0+/, "");
  if (!digits) return "0,00";
  const padded = digits.padStart(3, "0");
  const whole = padded.slice(0, -2);
  const dec = padded.slice(-2);
  const wholeFmt = Number(whole).toLocaleString("pt-BR");
  return `${wholeFmt},${dec}`;
}

/** Converte valor mascarado ("1.234,56") de volta pra centavos. */
export function maskedToCents(masked: string): number {
  const digits = String(masked).replace(/\D/g, "");
  if (!digits) return 0;
  return parseInt(digits, 10);
}

// ============================================================================
// PYX ↔ USx — cotação configurada pelo Master Admin
// ============================================================================
// USx é o nome oficial da moeda de referência baseada em dólar dentro do
// ecossistema BLACKSCLUB (não é um token separado — apenas nome/UX).
// `rateCentavos` = quantos centavos de PYX equivalem a 1 USx.
// Ex: 500 → 5,00 PYX = 1 USx.

/** Converte um valor de PYX (em centavos) para USx (float). */
export function pyxCentavosToUSD(
  pyxCentavos: number | null | undefined,
  rateCentavos: number | null | undefined,
): number {
  const c = Number(pyxCentavos || 0);
  const r = Number(rateCentavos || 0);
  if (!r || r <= 0) return 0;
  return c / r;
}

/** Alias legado — usa `formatUSx` internamente. Mantido para não quebrar callers. */
export function formatUSD(
  pyxCentavos: number | null | undefined,
  rateCentavos: number | null | undefined,
  opts: { compact?: boolean; withSign?: boolean; prefix?: string } = {},
): string {
  return formatUSx(pyxCentavos, rateCentavos, opts);
}

/** Formata valor em USx: "USx 1.234,56" (padrão brasileiro de casas). */
export function formatUSx(
  pyxCentavos: number | null | undefined,
  rateCentavos: number | null | undefined,
  opts: { compact?: boolean; withSign?: boolean; prefix?: string } = {},
): string {
  const usd = pyxCentavosToUSD(pyxCentavos, rateCentavos);
  const abs = Math.abs(usd);
  const sign = opts.withSign && usd < 0 ? "-" : "";
  const prefix = opts.prefix ?? "USx ";
  if (opts.compact && abs >= 1000) {
    const K = abs / 1000;
    if (K >= 1000) return `${sign}${prefix}${(K / 1000).toFixed(1).replace(".", ",")} mi`;
    return `${sign}${prefix}${K.toFixed(1).replace(".", ",")} mil`;
  }
  return `${sign}${prefix}${abs.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/** Converte digitação USx (masked "1.234,56") → centavos de PYX. */
export function usxMaskedToPyxCentavos(
  masked: string,
  rateCentavos: number | null | undefined,
): number {
  const digits = String(masked).replace(/\D/g, "");
  if (!digits) return 0;
  const usdCentavos = parseInt(digits, 10); // centavos de USx (2 decimais)
  const r = Number(rateCentavos || 0);
  if (!r) return 0;
  // pyx_centavos = usx_units * rate_centavos = (usdCentavos/100) * rateCentavos
  return Math.round((usdCentavos * r) / 100);
}

/** Formata a cotação: "1 USx = 5,00 PYX". */
export function formatRate(rateCentavos: number | null | undefined): string {
  const c = Number(rateCentavos || 0);
  if (!c) return "1 USx = —";
  const val = (c / 100).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `1 USx = ${val} PYX`;
}
