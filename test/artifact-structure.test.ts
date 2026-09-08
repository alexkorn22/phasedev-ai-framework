import { describe, expect, test } from "bun:test";
import {
  validateArtifactStructure,
  validateTableShape,
  type ArtifactStructureSpec,
  type TableShapeSpec
} from "../src/entities/artifact-structure";

const SPEC: ArtifactStructureSpec = {
  artifactName: "sample.md",
  title: "Sample",
  frontmatter: "required",
  checkDeepHeadings: true,
  checkHtmlComments: true,
  sections: {
    required: ["Alpha", "Beta"],
    membershipCaseInsensitive: true,
    orderCaseInsensitive: true
  }
};

function build(body: string): string {
  return `---\napproved: true\n---\n\n${body}`;
}

describe("validateArtifactStructure", () => {
  test("accepts a well-formed artifact", () => {
    const content = build("# Sample\n\n## Alpha\n\nText.\n\n## Beta\n\nText.\n");
    expect(validateArtifactStructure(content, SPEC).issues).toEqual([]);
  });

  test("reports a missing required section", () => {
    const content = build("# Sample\n\n## Alpha\n\nText.\n");
    const { issues } = validateArtifactStructure(content, SPEC);
    expect(issues).toContain("sample.md must contain section `## Beta`.");
  });

  test("reports a blocked placeholder", () => {
    const content = build("# Sample\n\n## Alpha\n\nTBD\n\n## Beta\n\nText.\n");
    const { issues } = validateArtifactStructure(content, SPEC);
    expect(issues).toContain("sample.md must not contain placeholder text: TBD.");
  });

  test("requires exactly one top-level heading", () => {
    const content = build("# Sample\n\n# Extra\n\n## Alpha\n\n## Beta\n");
    const { issues } = validateArtifactStructure(content, SPEC);
    expect(issues).toContain("sample.md must contain exactly one top-level heading: `# Sample`.");
  });

  test("flags missing frontmatter only when required", () => {
    const missing = "# Sample\n\n## Alpha\n\n## Beta\n";
    expect(validateArtifactStructure(missing, SPEC).issues)
      .toContain("sample.md must start with YAML frontmatter.");
    expect(validateArtifactStructure(missing, { ...SPEC, frontmatter: "optional" }).issues)
      .not.toContain("sample.md must start with YAML frontmatter.");
  });

  test("flags headings deeper than ## when enabled", () => {
    const content = build("# Sample\n\n## Alpha\n\n### Too deep\n\n## Beta\n");
    const { issues } = validateArtifactStructure(content, SPEC);
    expect(issues).toContain("sample.md must not contain headings deeper than `##`: `### Too deep`.");
  });

  test("allows optional sections while preserving required relative order", () => {
    const policy = {
      required: ["Alpha", "Beta"],
      optional: ["Gamma"],
      mustBeLastIfPresent: ["Gamma"],
      membershipCaseInsensitive: true,
      orderCaseInsensitive: true
    };
    const content = build("# Sample\n\n## Alpha\n\nText.\n\n## Beta\n\nText.\n\n## Gamma\n\nText.\n");
    expect(validateArtifactStructure(content, { ...SPEC, sections: policy }).issues).toEqual([]);
  });

  test("reports optional section that is not last when mustBeLastIfPresent applies", () => {
    const policy = {
      required: ["Alpha", "Beta"],
      optional: ["Gamma"],
      mustBeLastIfPresent: ["Gamma"],
      membershipCaseInsensitive: true,
      orderCaseInsensitive: true
    };
    const content = build("# Sample\n\n## Alpha\n\n## Gamma\n\n## Beta\n\n");
    const { issues } = validateArtifactStructure(content, { ...SPEC, sections: policy });
    expect(issues).toContain("sample.md section `## Gamma` must be the last `##` section when present.");
  });

  test("reports broken required relative order when optional sections are allowed", () => {
    const policy = {
      required: ["Alpha", "Beta"],
      optional: ["Gamma"],
      membershipCaseInsensitive: true,
      orderCaseInsensitive: true
    };
    const content = build("# Sample\n\n## Beta\n\n## Alpha\n\n");
    const { issues } = validateArtifactStructure(content, { ...SPEC, sections: policy });
    expect(issues).toContain("sample.md required `##` sections must appear in this order: `## Alpha`, `## Beta`.");
  });

  test("ignores placeholder inside fenced code block", () => {
    const content = build("# Sample\n\n## Alpha\n\n```\nTBD: something\n```\n\n## Beta\n\n```\nTODO: something else\nunknown\n```\n");
    const { issues } = validateArtifactStructure(content, SPEC);
    expect(issues).not.toContain("sample.md must not contain placeholder text: TBD.");
    expect(issues).not.toContain("sample.md must not contain placeholder text: TODO.");
    expect(issues).not.toContain("sample.md must not contain placeholder text: unknown.");
  });

  test("ignores HTML comments inside fenced code block", () => {
    const content = build("# Sample\n\n## Alpha\n\n```html\n<!-- this is a comment inside code -->\n```\n\n## Beta\n\nText.\n");
    const { issues } = validateArtifactStructure(content, SPEC);
    expect(issues).not.toContain("sample.md must not contain HTML template comments.");
  });
});

describe("validateTableShape", () => {
  const FILTERED: TableShapeSpec = { section: "Alpha", headers: ["ID", "Name"], mode: "filtered", rowChecks: false };
  const BLOCKS: TableShapeSpec = { section: "Alpha", headers: ["ID", "Name"], mode: "blocks", rowChecks: true };

  function sectionLines(rows: string): string[] {
    return `## Alpha\n\n${rows}`.split("\n");
  }

  test("reports a missing table", () => {
    const issues: string[] = [];
    validateTableShape("## Alpha\n\nNo table here.".split("\n"), FILTERED, issues);
    expect(issues).toContain("Section `## Alpha` must contain a markdown table.");
  });

  test("reports a header shape mismatch", () => {
    const issues: string[] = [];
    validateTableShape(sectionLines("| ID | Wrong |\n|---|---|\n| R1 | a |"), FILTERED, issues);
    expect(issues).toContain("Alpha columns must be exactly: ID, Name.");
  });

  test("reports a wrong cell count per row in blocks mode", () => {
    const issues: string[] = [];
    validateTableShape(sectionLines("| ID | Name |\n|---|---|\n| R1 |"), BLOCKS, issues);
    expect(issues).toContain("Alpha row 4 must have exactly 2 cells.");
  });

  test("reports empty cells in blocks mode", () => {
    const issues: string[] = [];
    validateTableShape(sectionLines("| ID | Name |\n|---|---|\n| R1 |  |"), BLOCKS, issues);
    expect(issues).toContain("Alpha row 4 (R1) has empty cell(s): Name.");
  });

  test("flags a second table only in blocks mode", () => {
    const twoTables = sectionLines("| ID | Name |\n|---|---|\n| R1 | a |\n\n| ID | Name |\n|---|---|\n| R2 | b |");
    const blockIssues: string[] = [];
    validateTableShape(twoTables, BLOCKS, blockIssues);
    expect(blockIssues).toContain("Section `## Alpha` must contain exactly one markdown table, found 2.");
  });
});
