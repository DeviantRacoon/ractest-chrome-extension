import type { TestStep } from "../../../commons/types";
import type { ILLMProvider } from "../../../core/domain/interfaces";
import { openRouterService } from "../../../modules/ai-assistant/services/openRouterService";

export class OpenRouterAdapter implements ILLMProvider {
  async generateSteps(
    goal: string,
    context?: string,
    dom?: string,
    previousSteps: TestStep[] = [],
  ): Promise<TestStep[]> {
    const fullPlanMode = goal.includes("[FULL_PLAN]");

    // Format history
    const history = previousSteps
      .map(
        (s, i) =>
          `${i + 1}. [${s.action}] ${s.selector} (ID: ${s.targetId}) value: ${s.value || "N/A"}`,
      )
      .join("\n");

    // 1. Construct System Prompt
    const systemPrompt = `
      You are RacTest, a deterministic web test runner.
      Execute tests. Do NOT provide QA commentary, advice, or explanations.

      Input format:
      [ID] <TAG attributes...>TEXT</TAG>

      Return STRICT JSON only.

      If planning mode is requested (goal includes [FULL_PLAN]), return:
      {
        "steps": [
          {
            "action": "CLICK" | "TYPE" | "SELECT" | "CHECK" | "UNCHECK" | "ASSERT" | "FINISH",
            "targetId": number,
            "selector": "optional backup selector",
            "value": "optional string",
            "useFakeData": boolean,
            "fakeDataType": "name" | "firstName" | "lastName" | "email" | "username" | "password" | "phone" | "address" | "city" | "state" | "zipCode" | "country" | "company" | "jobTitle" | "url" | "date" | "time" | "datetime" | "number" | "price" | "uuid" | "color" | "lorem",
            "expectedOutcome": "short expected test result",
            "stopOnFailure": true
          }
        ]
      }

      Otherwise return EXACTLY ONE step:
      {
        "step": {
          "action": "CLICK" | "TYPE" | "SELECT" | "CHECK" | "UNCHECK" | "ASSERT" | "FINISH",
          "targetId": number,
          "selector": "optional backup selector",
          "value": "optional string",
          "useFakeData": boolean,
          "fakeDataType": "name" | "firstName" | "lastName" | "email" | "username" | "password" | "phone" | "address" | "city" | "state" | "zipCode" | "country" | "company" | "jobTitle" | "url" | "date" | "time" | "datetime" | "number" | "price" | "uuid" | "color" | "lorem",
          "expectedOutcome": "short expected test result",
          "stopOnFailure": true
        }
      }

      Hard rules:
      - Output JSON only, no prose.
      - In non-planning mode: output exactly one step.
      - In planning mode: output up to 20 ordered steps.
      - Use targetId from provided [ID]. Never invent IDs.
      - Use FINISH only when goal is achieved OR failed conclusively.
      - Do not repeat same action+targetId when last outcome was no_effect.
      - For SELECT use option value, never label.
      - If visible errors/invalid state are present, prioritize ASSERT or FINISH.
      - For TYPE/SELECT actions, provide "value" unless useFakeData=true.
      - Keep focus on the immediate next executable step.
    `;

    // 2. Construct User Prompt
    const userPrompt = `
      Goal: "${goal}"

      Previous Executed Steps (MEMORY):
      ${history || "No steps executed yet."}

      Runtime Context: ${context || "No context provided."}

      Current Interactive Elements (Marked DOM):
      ${dom || "No DOM provided."}
    `;

    // 3. Call AI Service
    const response = await openRouterService.generateCompletion(
      systemPrompt,
      userPrompt,
    );

    // 4. Parse and validate response
    return this.parseResponse(response.content, fullPlanMode);
  }

  private parseResponse(content: string, fullPlanMode: boolean): TestStep[] {
    try {
      // Remove <think>...</think> blocks common in reasoning models
      let cleanContent = content
        .replace(/<think>[\s\S]*?<\/think>/g, "")
        .trim();

      // Extract JSON if wrapped in markdown code blocks
      const jsonMatch =
        cleanContent.match(/```json\n([\s\S]*?)\n```/) ||
        cleanContent.match(/```([\s\S]*?)```/) ||
        cleanContent.match(/\{[\s\S]*\}/); // Fallback

      if (jsonMatch) {
        cleanContent = jsonMatch[1] || jsonMatch[0];
      }

      const parsed = JSON.parse(cleanContent);
      const rawSteps = fullPlanMode
        ? Array.isArray(parsed.steps)
          ? parsed.steps
          : parsed.step
            ? [parsed.step]
            : []
        : parsed.step
          ? [parsed.step]
          : Array.isArray(parsed.steps)
            ? [parsed.steps[0]]
            : [];

      if (!rawSteps.length) return [];

      const mappedSteps: Array<TestStep | null> = rawSteps.map(
        (rawStep: any, index: number) => this.mapRawStep(rawStep, index),
      );
      const steps = mappedSteps.filter(
        (step: TestStep | null): step is TestStep => !!step,
      );

      return steps;
    } catch (e) {
      console.error("Failed to parse AI response:", e);
      console.debug("Raw Content causing error:", content);
      return [];
    }
  }

  private mapRawStep(rawStep: any, index: number): TestStep | null {
    if (!rawStep || typeof rawStep !== "object") return null;

    const action = String(rawStep.action || "").toUpperCase();
      const allowedActions = new Set([
        "CLICK",
        "TYPE",
        "SELECT",
        "CHECK",
        "UNCHECK",
        "ASSERT",
        "FINISH",
      ]);
    if (!allowedActions.has(action)) return null;

    const targetIdNumber = Number(rawStep.targetId);
    if (
      action !== "FINISH" &&
      (!Number.isFinite(targetIdNumber) || targetIdNumber <= 0)
    ) {
      return null;
    }

    const value = typeof rawStep.value === "string" ? rawStep.value : undefined;
    const useFakeData = Boolean(rawStep.useFakeData);

    if (action === "TYPE" && !useFakeData && !value?.trim()) return null;
    if (action === "SELECT" && !value?.trim()) return null;

    const step: TestStep = {
      id: crypto.randomUUID(),
      action: action as TestStep["action"],
      selector:
        typeof rawStep.selector === "string" && rawStep.selector.trim()
          ? rawStep.selector
          : "body",
      targetId: action === "FINISH" ? 0 : targetIdNumber,
      value,
      useFakeData,
      fakeDataType: rawStep.fakeDataType,
      delay: 500,
      order: index + 1,
      thought:
        typeof rawStep.expectedOutcome === "string"
          ? rawStep.expectedOutcome.slice(0, 240)
          : undefined,
    };

    return step;
  }
}
