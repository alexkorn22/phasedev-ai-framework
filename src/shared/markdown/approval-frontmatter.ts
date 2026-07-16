export function buildApprovalFrontmatter(date: string): string {
  return `approved: false\napproved_by: ""\ndate: ${date}`;
}
