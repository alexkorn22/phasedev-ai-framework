export interface CommandContext {
  args: string[];
  jsonMode: boolean;
  projectPath: string;
  changeName?: string;
}
