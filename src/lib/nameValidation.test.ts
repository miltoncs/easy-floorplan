import { describe, expect, it } from 'vitest'
import { MAX_NAME_LENGTH, countVisibleCharacters, validateName } from './nameValidation'

describe('nameValidation', () => {
  it('counts visible Unicode characters for combining text and emoji', () => {
    expect(countVisibleCharacters('Cafe\u0301')).toBe(4)
    expect(countVisibleCharacters('👨‍👩‍👧‍👦')).toBe(1)
    expect(countVisibleCharacters('مرحبا')).toBe(5)
    expect(countVisibleCharacters('部屋')).toBe(2)
  })

  it('accepts exactly 128 visible characters and rejects 129', () => {
    const exact = '床'.repeat(MAX_NAME_LENGTH)
    const over = `${exact}✨`

    expect(validateName(exact)).toMatchObject({ valid: true, visibleLength: MAX_NAME_LENGTH })
    expect(validateName(over)).toMatchObject({
      valid: false,
      visibleLength: MAX_NAME_LENGTH + 1,
    })
  })

  it('rejects empty or whitespace-only names', () => {
    expect(validateName('')).toMatchObject({ valid: false, error: 'Name is required.' })
    expect(validateName('   ')).toMatchObject({ valid: false, error: 'Name is required.' })
  })
})
