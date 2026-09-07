import { describe, test, expect } from "bun:test";
import {
  TEST_TARGETS_PLACEHOLDER,
  evidenceMatchesCheckRecipe,
  instantiateCheckRecipe,
  isSafeTestTargetSubstitution,
  normalizeTestCommand,
  validateFocusedCheckRecipe,
  validateFullCheckRecipe
} from "../src/entities/test-commands/resolve-check-commands";

describe("check recipe placeholder matcher", () => {
  test("instantiates composite recipe with non-empty targets", () => {
    const recipe = `bun test ${TEST_TARGETS_PLACEHOLDER}`;
    expect(instantiateCheckRecipe(recipe, "test/foo.test.ts test/bar.test.ts")).toBe(
      "bun test test/foo.test.ts test/bar.test.ts"
    );
  });

  test("instantiates prefix and suffix around placeholder", () => {
    const recipe = `npm run test -- ${TEST_TARGETS_PLACEHOLDER} --runInBand`;
    expect(instantiateCheckRecipe(recipe, "packages/core")).toBe(
      "npm run test -- packages/core --runInBand"
    );
  });

  test("rejects empty target substitution", () => {
    const recipe = `bun test ${TEST_TARGETS_PLACEHOLDER}`;
    expect(instantiateCheckRecipe(recipe, "")).toBeUndefined();
    expect(instantiateCheckRecipe(recipe, "   ")).toBeUndefined();
    expect(evidenceMatchesCheckRecipe(recipe, "bun test ")).toBe(false);
  });

  test("matches evidence against placeholder recipe with safe targets", () => {
    const recipe = `bun test ${TEST_TARGETS_PLACEHOLDER}`;
    expect(evidenceMatchesCheckRecipe(recipe, "`bun test test/a.test.ts`")).toBe(true);
    expect(evidenceMatchesCheckRecipe(recipe, "bun test test/a.test.ts test/b.test.ts")).toBe(true);
  });

  test("rejects unrelated or chained target commands", () => {
    const recipe = `bun test ${TEST_TARGETS_PLACEHOLDER}`;
    expect(evidenceMatchesCheckRecipe(recipe, "bun test test/a.test.ts; rm -rf /")).toBe(false);
    expect(evidenceMatchesCheckRecipe(recipe, "bun test test/a.test.ts && echo pwned")).toBe(false);
    expect(isSafeTestTargetSubstitution("test/a.test.ts; echo bad")).toBe(false);
  });

  test("rejects leading and embedded runner flags inside target substitution", () => {
    const recipe = `bun test ${TEST_TARGETS_PLACEHOLDER}`;
    expect(isSafeTestTargetSubstitution("--verbose test/a.test.ts")).toBe(false);
    expect(isSafeTestTargetSubstitution("-t pattern test/a.test.ts")).toBe(false);
    expect(isSafeTestTargetSubstitution("test/a.test.ts --verbose")).toBe(false);
    expect(isSafeTestTargetSubstitution("test/a.test.ts -t pattern")).toBe(false);
    expect(evidenceMatchesCheckRecipe(recipe, "bun test test/a.test.ts --verbose")).toBe(false);
    expect(evidenceMatchesCheckRecipe(recipe, "bun test --grep phase test/a.test.ts")).toBe(false);
    expect(instantiateCheckRecipe(recipe, "test/a.test.ts --run")).toBeUndefined();
  });

  test("accepts safe multiple targets, quoted paths, and globs", () => {
    const recipe = `bun test ${TEST_TARGETS_PLACEHOLDER}`;
    expect(isSafeTestTargetSubstitution("test/a.test.ts test/b.test.ts")).toBe(true);
    expect(isSafeTestTargetSubstitution('"test/my file.test.ts"')).toBe(true);
    expect(isSafeTestTargetSubstitution("test/**/*.test.ts")).toBe(true);
    expect(evidenceMatchesCheckRecipe(recipe, 'bun test "test/my file.test.ts" test/b.test.ts')).toBe(true);
    expect(evidenceMatchesCheckRecipe(recipe, "bun test test/**/*.spec.ts")).toBe(true);
  });

  test("composite recipe keeps runner flags outside placeholder while rejecting flaggy targets", () => {
    const recipe = `npm run test -- ${TEST_TARGETS_PLACEHOLDER} --runInBand`;
    expect(instantiateCheckRecipe(recipe, "packages/core")).toBe("npm run test -- packages/core --runInBand");
    expect(instantiateCheckRecipe(recipe, "packages/core --verbose")).toBeUndefined();
    expect(evidenceMatchesCheckRecipe(recipe, "npm run test -- packages/core --runInBand")).toBe(true);
    expect(evidenceMatchesCheckRecipe(recipe, "npm run test -- packages/core --runInBand --verbose")).toBe(false);
  });

  test("requires exact normalized match for target-independent recipes", () => {
    const recipe = "bun test";
    expect(evidenceMatchesCheckRecipe(recipe, "bun test")).toBe(true);
    expect(evidenceMatchesCheckRecipe(recipe, "bun test test/foo.test.ts")).toBe(false);
    expect(evidenceMatchesCheckRecipe(recipe, "`bun test`")).toBe(true);
  });

  test("normalizeTestCommand collapses whitespace and strips inline code", () => {
    expect(normalizeTestCommand("  `bun  test`  ")).toBe("bun test");
  });

  test("rejects shell injection patterns inside target substitution", () => {
    expect(isSafeTestTargetSubstitution("test/a.test.ts > /tmp/pwned")).toBe(false);
    expect(isSafeTestTargetSubstitution("test/a.test.ts < payload")).toBe(false);
    expect(isSafeTestTargetSubstitution("test/a.test.ts >> log.txt")).toBe(false);
    expect(isSafeTestTargetSubstitution("test/a.test.ts\nrm -rf /")).toBe(false);
    expect(isSafeTestTargetSubstitution("test/a.test.ts\rwhoami")).toBe(false);
    expect(isSafeTestTargetSubstitution("$(whoami)")).toBe(false);
    expect(isSafeTestTargetSubstitution("test/${HOME}.test.ts")).toBe(false);
    expect(isSafeTestTargetSubstitution("test/`id`.test.ts")).toBe(false);
    expect(isSafeTestTargetSubstitution("test/a.test.ts <<EOF")).toBe(false);
  });

  test("dequotes tokens before detecting embedded runner flags", () => {
    expect(isSafeTestTargetSubstitution('"--runInBand"')).toBe(false);
    expect(isSafeTestTargetSubstitution('test/a.test.ts "--verbose"')).toBe(false);
    expect(instantiateCheckRecipe(`bun test ${TEST_TARGETS_PLACEHOLDER}`, '"--runInBand"')).toBeUndefined();
  });

  test("validateFocusedCheckRecipe enforces at most one placeholder", () => {
    const double = `bun test ${TEST_TARGETS_PLACEHOLDER} ${TEST_TARGETS_PLACEHOLDER}`;
    expect(validateFocusedCheckRecipe("unit", double).some(issue => issue.includes("at most one"))).toBe(true);
    expect(validateFocusedCheckRecipe("unit", `bun test ${TEST_TARGETS_PLACEHOLDER}`)).toEqual([]);
    expect(validateFocusedCheckRecipe("phase", "bun test --grep phase")).toEqual([]);
  });

  test("validateFullCheckRecipe requires exact non-empty command without placeholders", () => {
    expect(validateFullCheckRecipe("").some(issue => issue.includes("non-empty"))).toBe(true);
    expect(validateFullCheckRecipe(`bun test ${TEST_TARGETS_PLACEHOLDER}`).some(issue => issue.includes("placeholder"))).toBe(true);
    expect(validateFullCheckRecipe("bun test")).toEqual([]);
  });

  test("legacy exact recipe accepts strict safe superset evidence for broader runs", () => {
    const recipe = "bun test test/a.test.ts test/b.test.ts test/c.test.ts test/d.test.ts";
    const nineSpecEvidence = "bun test test/a.test.ts test/b.test.ts test/c.test.ts test/d.test.ts test/e.test.ts test/f.test.ts test/g.test.ts test/h.test.ts test/i.test.ts";
    expect(evidenceMatchesCheckRecipe(recipe, nineSpecEvidence)).toBe(true);
    expect(evidenceMatchesCheckRecipe(recipe, recipe)).toBe(true);
  });

  test("legacy exact recipe rejects changed runner flags or operators in evidence", () => {
    const recipe = "bun test test/a.test.ts test/b.test.ts test/c.test.ts test/d.test.ts";
    expect(evidenceMatchesCheckRecipe(recipe, "npm test test/a.test.ts test/b.test.ts test/c.test.ts test/d.test.ts")).toBe(false);
    expect(evidenceMatchesCheckRecipe(recipe, "bun test --grep smoke test/a.test.ts test/b.test.ts test/c.test.ts test/d.test.ts")).toBe(false);
    expect(evidenceMatchesCheckRecipe(recipe, "bun test test/a.test.ts; rm -rf /")).toBe(false);
  });

  test("legacy exact recipe invalidates evidence after recipe target set changes", () => {
    const oldEvidence = "bun test test/a.test.ts test/b.test.ts test/c.test.ts test/d.test.ts test/e.test.ts";
    const newRecipe = "bun test test/x.test.ts test/y.test.ts test/z.test.ts test/w.test.ts";
    expect(evidenceMatchesCheckRecipe(newRecipe, oldEvidence)).toBe(false);
  });
});
