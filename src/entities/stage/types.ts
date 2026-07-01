export type Stage =
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
  stage: Stage;
  prompt: string;
  blocked: boolean;
  reason?: string;
}
