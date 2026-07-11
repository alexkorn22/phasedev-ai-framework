import { BlockingSeverity } from "../../entities/validation-findings/blocking-severity";

const POLICY: Record<BlockingSeverity, string> = {
  must_fix:
    "Blocking severities for this change: `MUST-FIX`. `RECOMMENDED` and `NIT` findings are non-blocking. `verdict: ready_with_risks` is allowed only when every open or reopened finding is `RECOMMENDED` or `NIT`.",
  recommended:
    "Blocking severities for this change: `MUST-FIX`, `RECOMMENDED`. `NIT` findings are non-blocking. `verdict: ready_with_risks` is allowed only when every open or reopened finding is `NIT`.",
  nit:
    "Blocking severities for this change: `MUST-FIX`, `RECOMMENDED`, `NIT` — every open finding blocks. `verdict: ready_with_risks` is unavailable; any open or reopened finding requires `verdict: repair_required`."
};

export function renderBlockingSeverityPolicy(threshold: BlockingSeverity): string {
  return POLICY[threshold];
}
