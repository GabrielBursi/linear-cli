/**
 * Read all of stdin as text, preserving the content exactly as received.
 *
 * Unlike `readIdsFromStdin` (which splits on whitespace/commas and
 * deduplicates), this keeps blank lines, indentation and markdown intact.
 */
export async function readStdinText(): Promise<string> {
  return await new Response(Deno.stdin.readable).text()
}
