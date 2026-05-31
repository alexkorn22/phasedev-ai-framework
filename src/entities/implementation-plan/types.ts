export interface Task {
  name: string;
  status: "completed" | "in_progress" | "not_started";
}

export interface Phase {
  id: number;
  name: string;
  status: "completed" | "in_progress" | "not_started";
  tasks: Task[];
  additionalChecks: string[];
}
