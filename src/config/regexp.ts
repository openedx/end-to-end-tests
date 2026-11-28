/**
 * Escapes text for use inside a `RegExp`, so an identifier the run produced
 * (a course key, a usage key, a URL) is matched literally.
 */
export function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
