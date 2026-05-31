export function normalizeLineEndings(content: string): string {
  return content.replace(/\r\n/g, "\n").replace(/^\uFEFF/, "").replace(/\u00A0/g, " ");
}
