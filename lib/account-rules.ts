export const MIN_PASSWORD_LENGTH = 8
export const MAX_PASSWORD_LENGTH = 128
export const passwordRules = `Use ${MIN_PASSWORD_LENGTH}–${MAX_PASSWORD_LENGTH} characters.`

export function validNewPassword(password: string) {
  return password.length >= MIN_PASSWORD_LENGTH && password.length <= MAX_PASSWORD_LENGTH
}
