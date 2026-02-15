import { inspectorService } from "../../../commons/lib/inspectorService";
import type { TestStep } from "../../../commons/types";
import { openRouterService } from "./openRouterService";

export interface AIStepGenerationResult {
  steps: TestStep[];
  tokensUsed?: number;
}

export class AIStepGenerator {
  public async generateStepsParams(
    prompt: string,
    profileId?: string,
    mode: "fast" | "normal" | "complex" = "normal",
  ): Promise<AIStepGenerationResult> {
    // 1. Distill DOM (fetch from Content Script)
    // We need the profileId to activate inspector if not active,
    // but usually user is already in StepEditor with an active profile.
    let distilledDOM = "";
    try {
      distilledDOM = await inspectorService.getDistilledDOM(
        profileId || "current",
        mode,
      );
    } catch (e) {
      console.error("Failed to get distilled DOM from content script:", e);
      // Fallback or re-throw?
      // If we can't get the DOM, we can't really do anything useful.
      throw new Error(
        "No se pudo obtener el contexto de la página. Asegúrate de que la pestaña está activa.",
      );
    }

    // 2. Construct System Prompt (Selection Strategy)
    const systemPrompt = `
      You are an expert QA Automation Engineer.
      Your task is to convert a user request into a list of test steps based on the provided list of interactive elements.

      Input Format:
      The user will provide a list of elements in this format:
      [ID] <TAG attributes...>TEXT</TAG> --> selector: "PRE_CALCULATED_SELECTOR"

      Output JSON format strictly:
      {
        "steps": [
          {
            "action": "CLICK" | "TYPE" | "SELECT" | "CHECK" | "UNCHECK",
            "selector": "Use the EXACT selector provided in the list",
            "value": "string value for TYPE/SELECT",
            "useFakeData": boolean (true if user asks for random/fake data),
            "fakeDataType": "email" | "name" | "phone" | "address" | "company" | "date" | "lorem" (if useFakeData is true),
             "explanation": "Brief reason for this step"
          }
        ]
      }

      Rules:
      - **CRITICAL**: Do NOT invent CSS selectors. You MUST use the exact string found after "--> selector:" for the chosen element.
      - Look at the ID and Text to find the right element.
      - If the user asks to "Fill form", identify all relevant input elements from the list and generate steps.
      - If "useFakeData" is true, do NOT provide a "value" (it will be generated at runtime), but MUST provide "fakeDataType".
      - For SELECT elements: if attributes include "select-values" and "select-labels", the step "value" MUST use the option VALUE from "select-values", never the visible label.
    `;

    // 3. Construct User Prompt
    const userPrompt = `
      User Request: "${prompt}"

      User Request: "${prompt}"

      Current Interactive Elements (List):
      ${distilledDOM}
    `;

    // 4. Call AI
    const response = await openRouterService.generateCompletion(
      systemPrompt,
      userPrompt,
    );

    // 5. Parse Response with Robust JSON Extraction
    try {
      let content = response.content;

      // Remove <think>...</think> blocks common in reasoning models
      content = content.replace(/<think>[\s\S]*?<\/think>/g, "").trim();

      // Extract JSON if wrapped in markdown code blocks
      const jsonMatch =
        content.match(/```json\n([\s\S]*?)\n```/) ||
        content.match(/```([\s\S]*?)```/) ||
        content.match(/\{[\s\S]*\}/); // Fallback: find first { and last }

      if (jsonMatch) {
        content = jsonMatch[1] || jsonMatch[0];
      }

      const parsed = JSON.parse(content);
      const rawSteps = parsed.steps || [];
      const selectMetadataBySelector =
        this.extractSelectMetadataFromDistilledDOM(distilledDOM);

      // Map to TestStep type
      const steps: TestStep[] = rawSteps.map((s: any, index: number) => ({
        id: crypto.randomUUID(),
        action: s.action,
        selector: s.selector,
        value: this.normalizeSelectValue(
          s.action,
          s.selector,
          s.value,
          selectMetadataBySelector,
        ),
        useFakeData: s.useFakeData,
        fakeDataType: s.fakeDataType,
        delay: 500, // Default delay
        order: index + 1,
      }));

      return {
        steps,
        tokensUsed: response.usage?.total_tokens,
      };
    } catch (e) {
      console.error("Failed to parse AI response:", e);
      console.debug("Raw Content causing error:", response.content);
      throw new Error("La IA no devolvió un formato válido JSON.");
    }
  }

  private extractSelectMetadataFromDistilledDOM(
    distilledDOM: string,
  ): Map<string, { values: string[]; labels: string[] }> {
    const map = new Map<string, { values: string[]; labels: string[] }>();
    const blocks = distilledDOM.split(/\n\s*\n/);

    for (const block of blocks) {
      if (!block.includes("<SELECT")) continue;

      const selectorMatch = block.match(/--> selector:\s*(".*")\s*$/m);
      if (!selectorMatch) continue;

      let selector = "";
      try {
        selector = JSON.parse(selectorMatch[1]);
      } catch {
        continue;
      }

      const tagMatch = block.match(/<SELECT\s+([^>]*)>/i);
      if (!tagMatch) continue;

      const attributesRaw = tagMatch[1];
      const attrs: Record<string, string> = {};
      const attrRegex = /([a-zA-Z0-9_-]+)="([^"]*)"/g;
      let match: RegExpExecArray | null = null;
      while ((match = attrRegex.exec(attributesRaw)) !== null) {
        attrs[match[1]] = match[2];
      }

      const values = (attrs["select-values"] || "")
        .split("|")
        .map((x) => x.trim())
        .filter(Boolean);
      const labels = (attrs["select-labels"] || "")
        .split("|")
        .map((x) => x.trim())
        .filter(Boolean);

      if (values.length > 0) {
        map.set(selector, { values, labels });
      }
    }

    return map;
  }

  private normalizeSelectValue(
    action: unknown,
    selector: unknown,
    value: unknown,
    metadata: Map<string, { values: string[]; labels: string[] }>,
  ): string | undefined {
    if (action !== "SELECT" || typeof value !== "string") {
      return typeof value === "string" ? value : undefined;
    }

    if (typeof selector !== "string") return value;
    const data = metadata.get(selector);
    if (!data) return value;

    const trimmed = value.trim();
    if (!trimmed) return trimmed;

    if (data.values.includes(trimmed)) return trimmed;

    const normalize = (input: string) =>
      input
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .trim();

    const wanted = normalize(trimmed);
    const labelIdx = data.labels.findIndex((label) => normalize(label) === wanted);
    if (labelIdx >= 0 && data.values[labelIdx]) {
      return data.values[labelIdx];
    }

    return value;
  }
}

export const aiStepGenerator = new AIStepGenerator();
