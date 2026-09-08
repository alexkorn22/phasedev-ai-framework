import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import * as fs from "fs";
import * as path from "path";
import { parseBrowserValidation } from "../src/entities/execution-contract/parse-browser-validation";
import { validateRulesArtifact } from "../src/entities/rules/validate-rules";
import { validRulesBody } from "./helpers/fixtures";

const testTmpDir = path.join(import.meta.dir, "tmp-browser-validation");

function writeContract(body: string): string {
  const filePath = path.join(testTmpDir, "execution_contract.md");
  fs.writeFileSync(
    filePath,
    `---
approved: true
---
${body}`,
    "utf-8"
  );
  return filePath;
}

function browserValidationTable(values: { start?: string; url?: string; criteria?: string; extraRows?: string }): string {
  const rows = [
    `| start | ${values.start ?? "Open the app and wait for the shell to load."} |`,
    `| url | ${values.url ?? "http://localhost:3000/app"} |`,
    `| criteria | ${values.criteria ?? "The dashboard renders with the primary navigation visible."} |`
  ];
  if (values.extraRows) {
    rows.push(values.extraRows);
  }
  return `## Browser Validation

| Field | Value |
|---|---|
${rows.join("\n")}
`;
}

function contractWithBrowserValidation(overrides: {
  start?: string;
  url?: string;
  criteria?: string;
  extraRows?: string;
  sectionOrder?: "after-environment" | "before-environment";
} = {}): string {
  const browserSection = browserValidationTable(overrides);
  const base = validRulesBody();
  if (overrides.sectionOrder === "before-environment") {
    return base.replace(
      "## Environment Notes\nTest fixture only.",
      `${browserSection}\n## Environment Notes\nTest fixture only.`
    );
  }
  return `${base}\n\n${browserSection}`;
}

beforeEach(() => {
  fs.mkdirSync(testTmpDir, { recursive: true });
});

afterEach(() => {
  fs.rmSync(testTmpDir, { recursive: true, force: true });
});

describe("browser validation contract", () => {
  test("contract without the section parses present false and validates cleanly", () => {
    const filePath = writeContract(validRulesBody());
    expect(parseBrowserValidation(filePath)).toEqual({ present: false });
    expect(validateRulesArtifact(filePath)).toEqual([]);
  });

  test("contract with a valid Browser Validation table parses all three fields", () => {
    const filePath = writeContract(
      contractWithBrowserValidation({
        start: "Launch the preview server and open the login screen.",
        url: "http://localhost:4173/login",
        criteria: "Username and password fields accept input and submit succeeds."
      })
    );
    expect(parseBrowserValidation(filePath)).toEqual({
      present: true,
      start: "Launch the preview server and open the login screen.",
      url: "http://localhost:4173/login",
      criteria: "Username and password fields accept input and submit succeeds."
    });
    expect(validateRulesArtifact(filePath)).toEqual([]);
  });

  test("missing url fails validation", () => {
    const filePath = writeContract(`${validRulesBody()}

## Browser Validation

| Field | Value |
|---|---|
| start | Open the app and wait for the shell to load. |
| criteria | The dashboard renders with the primary navigation visible. |
`);
    const issues = validateRulesArtifact(filePath);
    expect(issues.some(issue => issue.includes("url"))).toBe(true);
  });

  test("empty start fails validation", () => {
    const filePath = writeContract(contractWithBrowserValidation({ start: "  " }));
    const issues = validateRulesArtifact(filePath);
    expect(issues.some(issue => issue.includes("start") && issue.includes("non-empty"))).toBe(true);
  });

  test("extra field required is rejected", () => {
    const filePath = writeContract(
      contractWithBrowserValidation({ extraRows: "| required | yes |" })
    );
    const issues = validateRulesArtifact(filePath);
    expect(issues.some(issue => issue.includes("required") && issue.includes("not allowed"))).toBe(true);
  });

  test("wrong section order fails validation when Browser Validation is not last", () => {
    const filePath = writeContract(contractWithBrowserValidation({ sectionOrder: "before-environment" }));
    const issues = validateRulesArtifact(filePath);
    expect(issues.some(issue => issue.includes("Browser Validation") && issue.includes("last"))).toBe(true);
  });
});
