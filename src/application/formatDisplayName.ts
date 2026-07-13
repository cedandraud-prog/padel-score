export function formatRecognizedDisplayName(value: string): string {
  return value
    .trim()
    .replace(/\s+/g, ' ')
    .toLocaleLowerCase('fr-FR')
    .replace(
      /(^|[\s'’-])(\p{L})/gu,
      (_, separator: string, letter: string) =>
        `${separator}${letter.toLocaleUpperCase('fr-FR')}`,
    )
}
