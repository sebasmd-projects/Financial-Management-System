/** Enteros que NO son dinero (día del mes, plazo, número de cuotas, id de catálogo): texto validado → número. */
export function toInt(text: string, min = 0, max = 999_999_999): number | null {
  if (!/^\d{1,9}$/.test(text.trim())) return null;
  const value = +text.trim();
  return value >= min && value <= max ? value : null;
}
