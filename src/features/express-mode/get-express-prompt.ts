import { renderTemplate } from "../../shared/templates/render-template";
import { todayIsoDate } from "../../shared/time/today-iso-date";

export interface ExpressPromptResult {
  prompt: string;
}

export function getExpressPrompt(): ExpressPromptResult {
  return { prompt: renderTemplate("express", { date: todayIsoDate() }) };
}
