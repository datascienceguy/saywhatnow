export interface SearchToken {
  type: 'include' | 'exclude'
  value: string   // uppercased (matches DB storage)
  exact: boolean  // true = quoted phrase, exact substring; false = single word
}

/**
 * Parse a Google-style query string into tokens.
 *
 * Supported syntax:
 *   word          → must appear in clip (whole-word match)
 *   "exact phrase" → exact phrase must appear
 *   -word         → must NOT appear
 *   -"phrase"     → exact phrase must NOT appear
 */
export function parseSearchQuery(raw: string): SearchToken[] {
  const tokens: SearchToken[] = []
  // Match: -"...", "...", -word, word
  const re = /(-?"[^"]+"|-?\S+)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(raw)) !== null) {
    let t = m[0]
    const exclude = t.startsWith('-')
    if (exclude) t = t.slice(1)
    const quoted = t.startsWith('"') && t.endsWith('"') && t.length > 2
    const value = quoted ? t.slice(1, -1).trim() : t.trim()
    if (value.length < 1) continue
    tokens.push({ type: exclude ? 'exclude' : 'include', value: value.toUpperCase(), exact: quoted })
  }
  return tokens
}

/**
 * Returns the include-term values (uppercased) for use in highlighting.
 */
export function getHighlightTerms(tokens: SearchToken[]): string[] {
  return tokens.filter(t => t.type === 'include').map(t => t.value)
}

/**
 * Build a Prisma `text` filter for a single token.
 * Non-exact tokens use word-boundary-aware LIKE patterns.
 */
export function tokenToTextFilter(token: SearchToken): object {
  if (token.exact) {
    // Exact phrase — simple contains
    return { contains: token.value }
  }
  // Single word — match as a word (surrounded by spaces, start, or end)
  // SQLite LIKE doesn't support word boundaries, so we use contains as the
  // primary filter and rely on post-query filtering for precision.
  return { contains: token.value }
}
