import type { MailMessage } from './types';

/** An absolute http(s) URL in running text, up to the first delimiter. */
const TEXT_URL = /https?:\/\/[^\s"'<>]+/g;

/** The value of every `href` attribute in an HTML part. */
const HREF = /href\s*=\s*["']([^"']+)["']/gi;

/** HTML bodies carry entity-escaped query strings (`?a=1&amp;b=2`). */
const unescapeAmpersands = (url: string) => url.replaceAll('&amp;', '&');

/**
 * Every link a message carries, in order of first appearance and without
 * duplicates: the `href`s of the HTML part, then any URL in the plain-text part
 * the HTML did not already have. This is how a spec follows a notification
 * mail's links (the post, the preference centre, one-click unsubscribe) without
 * reading its localized copy.
 */
export function messageLinks(message: MailMessage): readonly string[] {
  const links = new Set<string>();
  for (const [, href] of message.html.matchAll(HREF)) {
    if (href !== undefined && /^https?:\/\//.test(href)) {
      links.add(unescapeAmpersands(href));
    }
  }
  for (const [url] of message.text.matchAll(TEXT_URL)) {
    links.add(unescapeAmpersands(url));
  }
  return [...links];
}
