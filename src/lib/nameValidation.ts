const segmenter =
  typeof Intl !== 'undefined' && 'Segmenter' in Intl
    ? new Intl.Segmenter(undefined, { granularity: 'grapheme' })
    : null

export const MAX_NAME_LENGTH = 128

export function countVisibleCharacters(value: string) {
  if (segmenter) {
    return Array.from(segmenter.segment(value)).length
  }

  return Array.from(value).length
}

export function validateName(value: string) {
  const visibleLength = countVisibleCharacters(value)

  if (value.trim().length === 0 || visibleLength === 0) {
    return {
      valid: false,
      error: 'Name is required.',
      visibleLength,
    }
  }

  if (visibleLength > MAX_NAME_LENGTH) {
    return {
      valid: false,
      error: `Name must be ${MAX_NAME_LENGTH} visible characters or fewer.`,
      visibleLength,
    }
  }

  return {
    valid: true,
    error: null,
    visibleLength,
  }
}
