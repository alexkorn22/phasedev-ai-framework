export type FlowStage =
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

export interface FlowPrompt {
  command: "init" | "next";
  stage: FlowStage;
  prompt: string;
  blocked: boolean;
  reason?: string;
}
