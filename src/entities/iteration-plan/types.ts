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
  status: "completed" | "in_progress" | "not_started";
  tasks: Task[];
  additionalChecks: string[];
  requiredChecks?: RequiredCheck[];
  generationBundle?: GenerationBundleRow[];
  checkEvidence?: CheckEvidenceRow[];
  rawContent?: string;
}
