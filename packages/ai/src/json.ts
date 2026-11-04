/**
 * Extrae un valor JSON de la respuesta de un modelo, tolerando un bloque ```json``` o
 * una frase antes o después. Devuelve undefined si no encuentra JSON válido.
 */
export function extractJson(text: string): unknown {
  const attempts: string[] = [text.trim()];
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) attempts.push(fenced[1].trim());
  const start = text.search(/[[{]/);
  const end = Math.max(text.lastIndexOf("}"), text.lastIndexOf("]"));
  if (start >= 0 && end > start) attempts.push(text.slice(start, end + 1));

  for (const candidate of attempts) {
    try {
      return JSON.parse(candidate);
    } catch {
      // probar el siguiente candidato
    }
  }
  return undefined;
}
