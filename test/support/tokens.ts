/**
 * The spec's measurements are `wc -c` over an Effort's Tickets converted at
 * roughly four bytes per token. Shared, because more than one argument in this
 * project is settled by a token count and they must all count the same way.
 */
const BYTES_PER_TOKEN = 4;

export function tokens(text: string): number {
  return Math.round(Buffer.byteLength(text, 'utf8') / BYTES_PER_TOKEN);
}
