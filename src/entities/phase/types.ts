export type Phase =
  | "init"
  | "change_intake"
  | "code_research"
  | "technical_design"
  | "iteration_planning"
  | "implementation"
  | "iteration_validation"
  | "final_validation"
  | "finding_repair"
  | "quick_plan"
  | "quick_implementation"
  | "quick_validation"
  | "quick_spec_revision"
  | "archive";

export interface Prompt {
  command: "init" | "next";
  phase: Phase;
  prompt: string;
  blocked: boolean;
  reason?: string;
}
