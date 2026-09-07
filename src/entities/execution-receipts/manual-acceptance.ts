export const DEFERRED_MANUAL_ACCEPTANCE_MARKER =
  /\[Deferred to Final Validation \/ Manual Acceptance\]/i;

const PRD_MANUAL_EVIDENCE_ROW =
  /\|\s*SC\d+\s*\|[^|\n]*\|\s*[^|\n]*\|\s*manual\s*\|/i;

const LEGACY_BROWSER_MANUAL_WORDING =
  /\b(browser|manual|visual)\s+(acceptance|verification|validation|evidence|testing|check)\b/i;

const LEGACY_ACCEPTANCE_EVIDENCE_PHRASE =
  /\bacceptance evidence requires (browser|manual|visual)\b/i;

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
  if (LEGACY_BROWSER_MANUAL_WORDING.test(combined)) {
    return true;
  }
  if (LEGACY_ACCEPTANCE_EVIDENCE_PHRASE.test(combined)) {
    return true;
  }
  return false;
}
