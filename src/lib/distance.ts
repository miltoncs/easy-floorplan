const PURE_NUMBER_PATTERN = /^[+-]?(?:\d+\.?\d*|\.\d+)$/
const FEET_INCHES_PATTERN =
  /^([+-])?\s*(?:(\d+(?:\.\d+)?)\s*(?:'|ft|foot|feet))?\s*(?:(\d+(?:\.\d+)?)\s*(?:"|in|inch|inches))?\s*$/
const SPACE_SEPARATED_PATTERN = /^([+-])?\s*(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)\s*$/

export function parseDistanceInput(value: string) {
  const trimmed = value.trim()

  if (!trimmed) {
    return null
  }

  if (PURE_NUMBER_PATTERN.test(trimmed)) {
    const numeric = Number(trimmed)
    return Number.isFinite(numeric) ? numeric : null
  }

  const feetAndInchesMatch = trimmed.match(FEET_INCHES_PATTERN)
  if (feetAndInchesMatch) {
    const sign = feetAndInchesMatch[1] === '-' ? -1 : 1
    const feetText = feetAndInchesMatch[2]
    const inchesText = feetAndInchesMatch[3]

    if (!feetText && !inchesText) {
      return null
    }

    const feet = feetText ? Number(feetText) : 0
    const inches = inchesText ? Number(inchesText) : 0

    if (!Number.isFinite(feet) || !Number.isFinite(inches)) {
      return null
    }

    return sign * (feet + inches / 12)
  }

  const spaceSeparatedMatch = trimmed.match(SPACE_SEPARATED_PATTERN)
  if (spaceSeparatedMatch) {
    const sign = spaceSeparatedMatch[1] === '-' ? -1 : 1
    const feet = Number(spaceSeparatedMatch[2])
    const inches = Number(spaceSeparatedMatch[3])

    if (!Number.isFinite(feet) || !Number.isFinite(inches)) {
      return null
    }

    return sign * (feet + inches / 12)
  }

  return null
}
