import { describe, test, expect } from "bun:test";
import * as fs from "fs";
import * as path from "path";

const repoRoot = path.resolve(__dirname, "..");
const skillMdPath = path.join(repoRoot, "skills", "phasedev-orchestrator", "SKILL.md");
const skillMd = fs.readFileSync(skillMdPath, "utf-8");

const NON_VALIDATION_HEADING = "### Canonical dispatch: non-validation phases";
const VALIDATION_HEADING = "### Canonical dispatch: validation phases (6A / 6B)";
const OLD_UNRUN_FINDING_BULLET = "unrun or failed check";

const BARE_PHASE_STEP = "1. Run: phasedev phase --change <change> — to get the phase contract.";
const ROLE_PHASE_STEP = "1. Run: phasedev phase --change <change> --role <role> — to get the phase contract.";

function sectionBody(markdown: string, heading: string): string {
  const start = markdown.indexOf(heading);
  expect(start).toBeGreaterThan(-1);
  const afterHeading = markdown.slice(start + heading.length);
  const nextHeading = afterHeading.search(/\n## /);
  return nextHeading === -1 ? afterHeading : afterHeading.slice(0, nextHeading);
}

function firstJavascriptFence(section: string): string {
  const match = section.match(/```javascript\n([\s\S]*?)```/);
  expect(match).not.toBeNull();
  return match![1];
}

describe("phasedev-orchestrator SKILL.md canonical dispatch bodies", () => {
  test("non-validation canonical body is directly copyable with bare phase step", () => {
    const section = sectionBody(skillMd, NON_VALIDATION_HEADING);
    const prompt = firstJavascriptFence(section);

    expect(prompt).toContain('Execute the current PhaseDev phase for change "<change>".');
    expect(prompt).toContain(BARE_PHASE_STEP);
    expect(prompt).not.toContain("--role <role>");
    expect(prompt).toContain("6. Do NOT run phasedev advance. Report results, blockers, and applied skills.");
  });

  test("validation canonical body is directly copyable with role-scoped phase step only", () => {
    const section = sectionBody(skillMd, VALIDATION_HEADING);
    const prompt = firstJavascriptFence(section);

    expect(prompt).toContain('Execute the current PhaseDev phase for change "<change>".');
    expect(prompt).toContain(ROLE_PHASE_STEP);
    expect(prompt).not.toContain(BARE_PHASE_STEP);
    expect(prompt).not.toMatch(/1\. Run: phasedev phase --change <change> — to get the phase contract\./);
  });

  test("validation wave recipe sits adjacent to validation canonical body", () => {
    const validationStart = skillMd.indexOf(VALIDATION_HEADING);
    const waveMarker = skillMd.indexOf("Wave 1", validationStart);
    const nextMajorSection = skillMd.indexOf("\n## Sub-Agent Report Reconciliation", validationStart);

    expect(validationStart).toBeGreaterThan(-1);
    expect(waveMarker).toBeGreaterThan(validationStart);
    expect(waveMarker).toBeLessThan(nextMajorSection);
    expect(sectionBody(skillMd, VALIDATION_HEADING)).toMatch(/Wave 1[\s\S]*Wave 2/);
  });

  test("does not rely on distant override prose for validation dispatch", () => {
    expect(skillMd).not.toContain("Validation phases override step 1");
    expect(skillMd).not.toMatch(/replace step 1 with the role-scoped command/i);
  });
});

describe("phasedev-orchestrator SKILL.md validation dispatch behavior", () => {
  test("qualifies generic phase-contract wording for validation subagents", () => {
    expect(skillMd).toMatch(/validation sub-agents[\s\S]*phasedev phase --change <change> --role/i);
    expect(skillMd).toMatch(/non-validation phases[\s\S]*bare `phasedev phase --change <change>`/i);
  });

  test("iteration_validation uses wave 1 review roles then one implementation-check owner", () => {
    const section = sectionBody(skillMd, VALIDATION_HEADING);
    expect(section).toMatch(/wave 1[\s\S]*code-review[\s\S]*security-review/i);
    expect(section).toMatch(/wave 2[\s\S]*implementation-check/i);
    expect(section).toMatch(/zero project checks/i);
    expect(section).toMatch(/never dispatch two `implementation-check`/i);
  });

  test("final_validation runs review/browser before one full-gate implementation-check", () => {
    const section = sectionBody(skillMd, VALIDATION_HEADING);
    expect(section).toMatch(/wave 1[\s\S]*code-review[\s\S]*security-review/i);
    expect(section).toMatch(/browser-qa[\s\S]*before[\s\S]*full/i);
    expect(section).toMatch(/wave 2[\s\S]*implementation-check[\s\S]*exactly once/i);
    expect(section).toMatch(/never run `full` in parallel/i);
  });

  test("lists browser-qa as a final_validation validation role", () => {
    const section = sectionBody(skillMd, VALIDATION_HEADING);
    expect(section).toMatch(/browser-qa[\s\S]*final_validation/i);
    expect(section).toContain("`browser-qa`");
  });

  test("spawns browser-qa only when execution_contract has Browser Validation section", () => {
    const section = sectionBody(skillMd, VALIDATION_HEADING);
    expect(section).toMatch(/browser-qa[\s\S]*## Browser Validation/i);
    expect(section).toMatch(/execution_contract\.md[\s\S]*Browser Validation/i);
    expect(section).not.toMatch(/browser-qa[\s\S]*PRD-only|PRD\/plan requires browser evidence without execution_contract/i);
  });

  test("blocked or missing gates retry in final_validation without findings or finding_repair", () => {
    expect(skillMd).toMatch(/blocked[\s\S]*final_validation[\s\S]*not[\s\S]*add-finding/i);
    expect(skillMd).toMatch(/blocked[\s\S]*not[\s\S]*finding_repair/i);
    expect(skillMd).toMatch(/missing browser|blocked localhost|blocked `full`/i);
    expect(skillMd).toMatch(/retry[\s\S]*browser-qa|retry[\s\S]*implementation-check/i);
  });

  test("infrastructure unavailable stays blocked in final_validation without product findings", () => {
    expect(skillMd).toMatch(/infrastructure[\s\S]*blocked/i);
    expect(skillMd).toMatch(/infrastructure[\s\S]*not[\s\S]*add-finding/i);
    expect(skillMd).toMatch(/infrastructure[\s\S]*not[\s\S]*finding_repair/i);
  });

  test("finding_repair dispatch follows open finding class not phase name alone", () => {
    expect(skillMd).toMatch(/finding_repair[\s\S]*open finding class/i);
    expect(skillMd).toMatch(/do not dispatch implementer[\s\S]*validation-infrastructure|browser|infra/i);
  });

  test("implementer does not own full gate or browser validation", () => {
    expect(skillMd).toMatch(/implementer[\s\S]*does not own[\s\S]*full|does not own[\s\S]*`full`/i);
    expect(skillMd).toMatch(/implementer[\s\S]*does not own[\s\S]*browser|browser-qa/i);
  });

  test("report reconciliation does not treat unrun gates as missing findings", () => {
    const reconciliation = skillMd.slice(skillMd.indexOf("## Sub-Agent Report Reconciliation"));
    expect(reconciliation).not.toContain(OLD_UNRUN_FINDING_BULLET);
    expect(reconciliation).toMatch(/product[\s\S]*(no matching row|without a matching finding|product gap)/i);
    expect(reconciliation).toMatch(/unrun|blocked gate|gate evidence/i);
  });

  test("documents sequential command deduplication without check_runs artifacts", () => {
    expect(skillMd).toMatch(/reuse[\s\S]*Check Evidence/i);
    expect(skillMd).toMatch(/full runs only once|`full` runs only once/i);
    expect(skillMd).toContain("Do not add `check_runs.md`");
  });

  test("orchestrator never performs validation checks itself", () => {
    expect(skillMd).toMatch(/orchestrator never performs phase work/i);
    expect(skillMd).toMatch(/never performs[\s\S]*project checks/i);
  });

  test("archive handling references non-validation canonical dispatch body", () => {
    const archiveSection = skillMd.slice(skillMd.indexOf("## Archive Handling"));
    expect(archiveSection).toMatch(/non-validation canonical dispatch body/i);
    expect(archiveSection).toContain("#canonical-dispatch-non-validation-phases");
  });
});

describe("phasedev-orchestrator SKILL.md browser-qa dispatch", () => {
  test("does not define a separate browser/manual prompt without --role", () => {
    expect(skillMd).not.toContain("### Canonical dispatch: browser/manual auxiliary validation");
    expect(skillMd).not.toMatch(/Read PRD and implementation-plan acceptance evidence for browser/i);
    expect(skillMd).not.toContain('Execute browser/manual validation for change "<change>".');
  });

  test("browser-qa uses the same validation canonical body with --role browser-qa", () => {
    const section = sectionBody(skillMd, VALIDATION_HEADING);
    const prompt = firstJavascriptFence(section);

    expect(prompt).toContain("phasedev phase --change <change> --role <role>");
    expect(section).toMatch(/browser-qa[\s\S]*--role browser-qa/i);
    expect(section).toMatch(/browser-qa[\s\S]*same validation body|same validation canonical body/i);
  });
});
