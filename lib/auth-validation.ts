const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export type AccountIdentifier = { email: string; phone: null } | { email: null; phone: string }

export function normalizeAccountName(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const name = value.trim()
  if (!name || name.length > 80 || /[\u0000-\u001f\u007f]/u.test(name)) return null
  return name
}

export function normalizeAccountIdentifier(value: unknown): AccountIdentifier | null {
  if (typeof value !== 'string') return null
  const input = value.trim()
  const email = input.toLowerCase()
  if (email.length <= 254 && EMAIL_PATTERN.test(email)) return { email, phone: null }

  if (!/^\+?[\d\s().-]+$/.test(input)) return null
  const digits = input.replace(/\D/g, '')
  if (digits.length === 10) return { email: null, phone: `+91${digits}` }
  if (digits.length === 12 && digits.startsWith('91')) return { email: null, phone: `+${digits}` }
  if (input.startsWith('+') && digits.length >= 7 && digits.length <= 15 && digits[0] !== '0') {
    return { email: null, phone: `+${digits}` }
  }
  if (digits.length >= 11 && digits.length <= 15 && digits[0] !== '0') {
    return { email: null, phone: `+${digits}` }
  }
  return null
}

export function isValidPassword(password: unknown, isSignup: boolean): password is string {
  return typeof password === 'string' &&
    password.length <= 256 &&
    (isSignup ? password.length >= 12 : password.length > 0)
}
