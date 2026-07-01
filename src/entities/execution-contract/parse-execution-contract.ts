import * as fs from "fs";

export interface ParsedSection {
  heading: string;
  content: string;
}

export function parseExecutionContract(path: string): ParsedSection[] {
  if (!fs.existsSync(path)) {
    return [];
  }

  const content = fs.readFileSync(path, "utf-8");
  const sections: ParsedSection[] = [];
  const headingRegex = /^##\s+(.+)$/gm;
  let match: RegExpExecArray | null;

  let lastIndex = 0;
  let lastHeading = "";

  while ((match = headingRegex.exec(content)) !== null) {
    if (lastHeading) {
      sections.push({
        heading: lastHeading,
        content: content.slice(lastIndex, match.index).trim()
      });
    }
    lastHeading = match[1];
    lastIndex = match.index + match[0].length;
  }

  if (lastHeading) {
    sections.push({
      heading: lastHeading,
      content: content.slice(lastIndex).trim()
    });
  }

  return sections;
}
