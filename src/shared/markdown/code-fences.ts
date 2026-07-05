/**
 * Fenced-code-block awareness for markdown structure parsers.
 *
 * PhaseDev artifacts may legitimately contain fenced examples (``` or ~~~)
 * whose content looks like real structure: `## Iteration 9: Example [ ]`,
 * `- [ ] example task`, `| a | b |` tables, `## Heading`. Structure parsers
 * must never treat such lines as live data.
 */

/**
 * Compute a per-line mask: true when the line is inside a fenced code block,
 * including the opening and closing fence delimiter lines themselves.
 * An unclosed fence extends to the end of the input (CommonMark behavior).
 */
export function fencedCodeLineMask(lines: string[]): boolean[] {
  const mask = new Array<boolean>(lines.length).fill(false);
  let openFenceChar: "`" | "~" | null = null;
  let openFenceLength = 0;

  for (let index = 0; index < lines.length; index++) {
    const trimmed = lines[index].trimStart();

    if (openFenceChar === null) {
      const open = trimmed.match(/^(`{3,}|~{3,})/);
      if (open) {
        openFenceChar = open[1][0] as "`" | "~";
        openFenceLength = open[1].length;
        mask[index] = true;
      }
      continue;
    }

    mask[index] = true;
    const close = trimmed.match(/^(`{3,}|~{3,})\s*$/);
    if (close && close[1][0] === openFenceChar && close[1].length >= openFenceLength) {
      openFenceChar = null;
    }
  }

  return mask;
}

/**
 * Return a copy of `lines` with every fenced-code line replaced by an empty
 * string. Indices and line numbers stay stable, so parsers can keep reporting
 * accurate positions while fenced content matches no structural pattern.
 */
export function blankFencedCodeLines(lines: string[]): string[] {
  const mask = fencedCodeLineMask(lines);
  return lines.map((line, index) => (mask[index] ? "" : line));
}
