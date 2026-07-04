import { describe, test, expect } from "bun:test";
import { loadSchema, validateSchemaSections } from "../src/entities/schema/load-schema";
import type { ArtifactSchema } from "../src/entities/schema/load-schema";

// ============================================================================
// Helpers
// ============================================================================

const allSectionsBody = `# Design

## Executive Summary

Content.

## Traceability Mapping

Content.

## Architecture Package Map

Content.

## Key Design Decisions

Content.

## API Specification

Content.

## Data Model

Content.

## Contracts, Interfaces & Boundaries

Content.

## Risks & Open Questions

Content.`;

function bodyWithout(headingName: string): string {
  return allSectionsBody.replace(new RegExp(`## ${escapeRegex(headingName)}[^#]*`, "m"), "");
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ============================================================================
// loadSchema
// ============================================================================

describe("loadSchema", () => {
  test('loadSchema("design") returns a valid schema object', () => {
    const schema = loadSchema("design");
    expect(schema).not.toBeNull();

    const s = schema as ArtifactSchema;
    expect(s.artifact).toBe("design");
    expect(s.mode).toBe("partial");
    expect(s.sections).toBeDefined();

    // Required sections
    expect(s.sections["Executive Summary"].required).toBe(true);
    expect(s.sections["Traceability Mapping"].required).toBe(true);
    expect(s.sections["Architecture Package Map"].required).toBe(true);
    expect(s.sections["Key Design Decisions"].required).toBe(true);
    expect(s.sections["Risks & Open Questions"].required).toBe(true);

    // Optional sections (not in the 6 base template sections)
    expect(s.sections["API Specification"].required).toBe(false);
    expect(s.sections["Data Model"].required).toBe(false);

    // Base template sections (all required)
    expect(s.sections["Contracts, Interfaces & Boundaries"].required).toBe(true);
  });

  test('loadSchema("nonexistent") returns null', () => {
    const schema = loadSchema("nonexistent");
    expect(schema).toBeNull();
  });
});

// ============================================================================
// validateSchemaSections — partial mode
// ============================================================================

describe("validateSchemaSections (partial mode)", () => {
  const schema = loadSchema("design") as ArtifactSchema;

  test("missing optional section (API Specification) is OK in partial mode", () => {
    const body = bodyWithout("API Specification");
    const issues = validateSchemaSections(body, schema, "partial");
    expect(issues).toEqual([]);
  });

  test("missing required section returns issue in partial mode", () => {
    const body = bodyWithout("Executive Summary");
    const issues = validateSchemaSections(body, schema, "partial");
    expect(issues.length).toBe(1);
    expect(issues[0]).toContain("Executive Summary");
  });

  test("all sections present returns no issues in partial mode", () => {
    const issues = validateSchemaSections(allSectionsBody, schema, "partial");
    expect(issues).toEqual([]);
  });
});

// ============================================================================
// validateSchemaSections — full mode
// ============================================================================

describe("validateSchemaSections (full mode)", () => {
  const schema = loadSchema("design") as ArtifactSchema;

  test("missing optional section returns issue in full mode", () => {
    const body = bodyWithout("Contracts, Interfaces & Boundaries");
    const issues = validateSchemaSections(body, schema, "full");
    expect(issues.length).toBe(1);
    expect(issues[0]).toContain("Contracts, Interfaces & Boundaries");
  });

  test("missing required section returns issue in full mode", () => {
    const body = bodyWithout("Executive Summary");
    const issues = validateSchemaSections(body, schema, "full");
    expect(issues.length).toBe(1);
    expect(issues[0]).toContain("Executive Summary");
  });

  test("multiple missing sections return all issues in full mode", () => {
    const body = bodyWithout("Executive Summary")
      .replace(/## Traceability Mapping[^#]*##/s, "##");
    const issues = validateSchemaSections(body, schema, "full");
    expect(issues.length).toBeGreaterThanOrEqual(2);
    expect(issues.some(i => i.includes("Executive Summary"))).toBe(true);
    expect(issues.some(i => i.includes("Traceability Mapping"))).toBe(true);
  });

  test("all sections present returns no issues in full mode", () => {
    const issues = validateSchemaSections(allSectionsBody, schema, "full");
    expect(issues).toEqual([]);
  });
});
