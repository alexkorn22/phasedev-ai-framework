import { describe, test, expect } from "bun:test";
import {
  BLOCKING_SEVERITY_VALUES,
  DEFAULT_BLOCKING_SEVERITY,
  severityBlocks,
  blockingSeverityLabel
} from "../src/entities/validation-findings/blocking-severity";

describe("severityBlocks", () => {
  test("must_fix threshold blocks only MUST-FIX", () => {
    expect(severityBlocks("MUST-FIX", "must_fix")).toBe(true);
    expect(severityBlocks("RECOMMENDED", "must_fix")).toBe(false);
    expect(severityBlocks("NIT", "must_fix")).toBe(false);
  });

  test("recommended threshold blocks MUST-FIX and RECOMMENDED", () => {
    expect(severityBlocks("MUST-FIX", "recommended")).toBe(true);
    expect(severityBlocks("RECOMMENDED", "recommended")).toBe(true);
    expect(severityBlocks("NIT", "recommended")).toBe(false);
  });

  test("nit threshold blocks everything", () => {
    expect(severityBlocks("MUST-FIX", "nit")).toBe(true);
    expect(severityBlocks("RECOMMENDED", "nit")).toBe(true);
    expect(severityBlocks("NIT", "nit")).toBe(true);
  });
});

describe("blockingSeverityLabel", () => {
  test("labels name the blocking set", () => {
    expect(blockingSeverityLabel("must_fix")).toBe("MUST-FIX");
    expect(blockingSeverityLabel("recommended")).toBe("MUST-FIX or RECOMMENDED");
    expect(blockingSeverityLabel("nit")).toBe("MUST-FIX, RECOMMENDED, or NIT");
  });
});

describe("constants", () => {
  test("default is must_fix and values are the three severities", () => {
    expect(DEFAULT_BLOCKING_SEVERITY).toBe("must_fix");
    expect([...BLOCKING_SEVERITY_VALUES]).toEqual(["must_fix", "recommended", "nit"]);
  });
});
