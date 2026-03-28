const SMALL_WORDS = new Set(['a', 'an', 'the', 'and', 'but', 'or', 'for', 'nor', 'on', 'at', 'to', 'by', 'in', 'of', 'up', 'as'])

export function toTitleCase(str: string | null | undefined): string {
  if (!str) return ''
  return str
    .toLowerCase()
    .split(' ')
    .map((word, i) => {
      if (i !== 0 && SMALL_WORDS.has(word)) return word
      return word.charAt(0).toUpperCase() + word.slice(1)
    })
    .join(' ')
}

export function toSentenceCase(str: string | null | undefined): string {
  if (!str) return ''
  const lower = str.toLowerCase()
  return lower.charAt(0).toUpperCase() + lower.slice(1)
}
