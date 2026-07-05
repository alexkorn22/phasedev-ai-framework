export interface Task {
  id: string;
  name: string;
  status: "completed" | "in_progress" | "not_started";
  children: Task[];
}

export interface GenerationBundleRow {
  area: string;
  required: string;
  plan: string;
}

export interface CheckEvidenceRow {
  check: string;
  commandOrMethod: string;
  result: string;
  evidence: string;
  notes: string;
}

export interface RequiredCheck {
  check: string;
  command: string;
}

export interface Iteration {
  id: number;
  name: string;
  /**
   * Derived from the heading checkbox `[x|~| |/]`. `x` is completed, `~` is
   * in_progress, and both ` ` and `/` are not_started: `/` is an accepted but
   * unwritten heading marker (writers never emit it) and is deliberately kept
   * distinct from `~` so it never counts as the single active iteration.
   */
  status: "completed" | "in_progress" | "not_started";
  tasks: Task[];
  additionalChecks: string[];
  requiredChecks?: RequiredCheck[];
  generationBundle?: GenerationBundleRow[];
  checkEvidence?: CheckEvidenceRow[];
  rawContent?: string;
}
