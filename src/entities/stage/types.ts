export type Stage =
  | "init"
  | "setup"
  | "research"
  | "design"
  | "plan"
  | "implementation"
  | "phase_validation"
  | "final_validation"
  | "repair"
  | "archive";

export interface Prompt {
  command: "init" | "next";
  stage: Stage;
  prompt: string;
  blocked: boolean;
  reason?: string;
}
