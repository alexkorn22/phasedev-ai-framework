import { describe, test, expect } from "bun:test";
import { renderBlockingSeverityPolicy } from "../src/features/phase-control/blocking-severity-policy";
import { renderValidationCommonContract } from "../src/features/phase-control/validation-common-contract";
import { renderValidationFindingsTemplate } from "../src/features/phase-control/prompt-render-helpers";
import { DEFAULT_CONFIG } from "../src/entities/config/config";

describe("renderBlockingSeverityPolicy", () => {
  test("names the blocking set per threshold", () => {
    expect(renderBlockingSeverityPolicy("must_fix")).toContain("`RECOMMENDED` and `NIT` findings are non-blocking");
    expect(renderBlockingSeverityPolicy("recommended")).toContain("`MUST-FIX`, `RECOMMENDED`");
    expect(renderBlockingSeverityPolicy("nit")).toContain("ready_with_risks` is unavailable");
  });
});

describe("templates embed the policy without unresolved placeholders", () => {
  test("validation_common renders the recommended policy", () => {
    const rendered = renderValidationCommonContract("iteration_validation", { ...DEFAULT_CONFIG, blockingSeverity: "recommended" });
    expect(rendered).toContain("`NIT` findings are non-blocking");
    expect(rendered).not.toContain("{{");
  });

  test("validation_findings renders the nit policy", () => {
    const rendered = renderValidationFindingsTemplate("iteration", "2026-07-11", "nit");
    expect(rendered).toContain("every open finding blocks");
    expect(rendered).not.toContain("{{");
  });
});
