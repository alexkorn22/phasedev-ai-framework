export const DEFERRED_MANUAL_ACCEPTANCE_MARKER =
  /\[Deferred to Final Validation \/ Manual Acceptance\]/i;

const PRD_MANUAL_EVIDENCE_ROW =
  /\|\s*SC\d+\s*\|[^|\n]*\|\s*[^|\n]*\|\s*manual\s*\|/i;

const EXPLICIT_ACCEPTANCE_EVIDENCE_PHRASE =
  /\bacceptance evidence requires (browser|manual)\b/i;

const EXPLICIT_BROWSER_MANUAL_ACCEPTANCE =
  /\b(browser\/manual|manual\/browser)\s+(acceptance|validation|verification)\b/i;

const EXPLICIT_BROWSER_OR_MANUAL_ACCEPTANCE =
  /\bbrowser or manual (acceptance|validation|verification)\b/i;

export function requiresManualAcceptance(input: {
  planContent: string;
  prdContent: string;
}): boolean {
  const combined = `${input.planContent}\n${input.prdContent}`;
  if (DEFERRED_MANUAL_ACCEPTANCE_MARKER.test(combined)) {
    return true;
  }
  if (PRD_MANUAL_EVIDENCE_ROW.test(input.prdContent)) {
    return true;
  }
  if (EXPLICIT_ACCEPTANCE_EVIDENCE_PHRASE.test(combined)) {
    return true;
  }
  if (EXPLICIT_BROWSER_MANUAL_ACCEPTANCE.test(combined)) {
    return true;
  }
  if (EXPLICIT_BROWSER_OR_MANUAL_ACCEPTANCE.test(combined)) {
    return true;
  }
  return false;
}
