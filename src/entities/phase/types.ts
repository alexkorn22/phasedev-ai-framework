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
  | "archive";

export interface Prompt {
  command: "init" | "next";
  phase: Phase;
  prompt: string;
  blocked: boolean;
  reason?: string;
}
