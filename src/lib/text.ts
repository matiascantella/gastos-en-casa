/**
 * Repara texto UTF-8 que fue leído como Latin-1 ("DescripciÃ³n" -> "Descripción").
 * Revolut sirve sus CSV así, y Google Sheets lo empeora.
 */
export function fixMojibake(s: string): string {
  if (!s) return s
  // Firma típica del problema: Ã, Â, Ð seguidos de un byte de continuación
  if (!/[\u00C3\u00C2\u00D0][\u0080-\u00BF]/.test(s)) return s
  try {
    const bytes = new Uint8Array(s.length)
    for (let i = 0; i < s.length; i++) {
      const c = s.charCodeAt(i)
      if (c > 0xff) return s // no era latin-1, no tocar
      bytes[i] = c
    }
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    return s
  }
}

/** Minúsculas, sin acentos, espacios colapsados. Para comparar reglas y nombres. */
export function norm(s: string): string {
  return fixMojibake(s ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Limpia la descripción cruda de un extracto para mostrarla.
 * LHV mete dirección y país separados por "\", y a veces un prefijo "(..7950) fecha hora".
 */
export function cleanDescription(raw: string): string {
  let s = fixMojibake(raw ?? '').trim()
  s = s.replace(/^\(\.\.\d+\)\s*\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}\s*/, '')
  s = s.split('\\')[0]
  s = s.replace(/\s{2,}/g, ' ').trim()
  return s
}

/** Hash determinista (FNV-1a de 64 bits en dos mitades) para deduplicar movimientos. */
export function hashId(...parts: (string | number)[]): string {
  const s = parts.join('|')
  let h1 = 0x811c9dc5
  let h2 = 0x01000193
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i)
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0
    h2 = Math.imul(h2 ^ (c + i), 0x85ebca6b) >>> 0
  }
  return h1.toString(36).padStart(7, '0') + h2.toString(36).padStart(7, '0')
}

/** Detecta si un texto contiene el nombre de una persona (con sus alias). */
export function mentionsPerson(text: string, names: string[]): boolean {
  const t = norm(text)
  return names.some((n) => {
    const nn = norm(n)
    if (nn.length < 3) return false
    if (t.includes(nn)) return true
    // "Juan Carlos Perez" vs "JUAN PEREZ": exigir nombre + apellido
    const parts = nn.split(' ').filter((p) => p.length > 2)
    if (parts.length >= 2) {
      const first = parts[0]
      const last = parts[parts.length - 1]
      return t.includes(first) && t.includes(last)
    }
    return false
  })
}

/** Extrae IBANs de un texto. */
export function findIbans(text: string): string[] {
  const m = fixMojibake(text ?? '').toUpperCase().match(/\b[A-Z]{2}\d{2}[A-Z0-9]{10,30}\b/g)
  return m ? Array.from(new Set(m)) : []
}
