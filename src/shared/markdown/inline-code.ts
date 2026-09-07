/**
 * Render a string as markdown inline code, using the shortest safe fence when
 * the content itself contains backticks.
 */
export function renderMarkdownInlineCode(content: string): string {
  let fence = "`";
  while (content.includes(fence)) {
    fence += "`";
  }
  return `${fence}${content}${fence}`;
}
