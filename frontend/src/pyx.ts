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
