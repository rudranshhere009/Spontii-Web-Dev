import { randomBytes } from 'node:crypto'

export const ADMIN_PASSWORD_MIN = 12

export function passwordProblem(password, email = '') {
  if (typeof password !== 'string' || password.length < ADMIN_PASSWORD_MIN) {
    return `Use at least ${ADMIN_PASSWORD_MIN} characters.`
  }
  if (password.length > 128) return 'Use no more than 128 characters.'
  const kinds = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((pattern) => pattern.test(password)).length
  if (kinds < 3) return 'Mix at least three of: lowercase, uppercase, numbers and symbols.'
  if (email && password.toLowerCase().includes(email.toLowerCase())) {
    return "Don't use your email address in the password."
  }
  return null
}

/* Temporary passwords for new admins and resets; always satisfies passwordProblem(). */
export function temporaryPassword() {
  return `Sp-${randomBytes(12).toString('base64url')}-9a`
}
