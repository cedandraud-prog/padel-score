import { normalizeSpeech } from './normalizeSpeech'

const CONTROLLED_RESPONSE_ALIASES: Readonly<Record<string, readonly string[]>> =
  {
    gagne: ['gagne', 'gagner'],
  }

export function canonicalizeControlledResponse(value: string): string {
  const normalized = normalizeSpeech(value)
  for (const [canonical, aliases] of Object.entries(
    CONTROLLED_RESPONSE_ALIASES,
  )) {
    if (aliases.includes(normalized)) return canonical
  }
  return normalized
}

export function matchesControlledResponse(
  spokenValue: string,
  expectedValue: string,
): boolean {
  return (
    canonicalizeControlledResponse(spokenValue) ===
    canonicalizeControlledResponse(expectedValue)
  )
}
