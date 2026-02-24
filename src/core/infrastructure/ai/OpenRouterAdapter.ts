import type { TestStep } from "../../../commons/types";
import type { ILLMProvider } from "../../../core/domain/interfaces";

const getOpenRouterService = async () =>
  (await import("../../../modules/ai-assistant/services/openRouterService"))
    .openRouterService;

export class OpenRouterAdapter implements ILLMProvider {
  async generateSteps(
    goal: string,
    context?: string,
    dom?: string,
    previousSteps: TestStep[] = [],
  ): Promise<TestStep[]> {
    const fullPlanMode = goal.includes("[FULL_PLAN]");
    const fillFirstMode = goal.includes("[FORM_FILL_FIRST]");
    const chunkMatch = goal.match(/\[PLAN_CHUNK_MAX=(\d{1,2})\]/i);
    const planningLimit = chunkMatch
      ? Math.max(1, Math.min(20, Number(chunkMatch[1])))
      : 20;

    // Format history
    const history = previousSteps
      .slice(-10)
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
      - In planning mode: output up to ${planningLimit} ordered steps.
      - Use targetId from provided [ID]. Never invent IDs.
      - Use FINISH only when goal is achieved OR failed conclusively.
      - Do not repeat same action+targetId when last outcome was no_effect.
      - For SELECT use option value, never label.
      - If visible errors/invalid state are present, prioritize ASSERT or FINISH.
      - For TYPE/SELECT actions, provide "value" unless useFakeData=true.
      - Keep focus on the immediate next executable step.
      - Use Runtime Context key "submit_state" as execution authority:
        - submit_state=filling: never FINISH, avoid submit/create/save clicks.
        - submit_state=ready_to_commit: prioritize one commit click.
        - submit_state=commit_in_flight: avoid repeated commit clicks.
        - submit_state=committed or verified: prefer FINISH unless explicit error evidence exists.
      - If goal includes [FORM_FILL_FIRST]:
        - Prioritize completing all likely form controls first (TYPE/SELECT/CHECK).
        - Avoid submit/confirm/save clicks until fields are populated.
        - Only validate errors after attempting submit or critical commit action.
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
    const openRouterService = await getOpenRouterService();
    const response = await openRouterService.generateCompletion(
      systemPrompt,
      userPrompt,
    );

    // 4. Parse and validate response
    return this.parseResponse(response.content, fullPlanMode || fillFirstMode);
  }

  async evaluateOutcome(params: {
    goal: string;
    beforeContext: string;
    afterContext: string;
    signals: {
      visualErrors: string[];
      outcomeSignals: string[];
      newErrorKeywords: string[];
      domChanged: boolean;
    };
    executedSteps: TestStep[];
  }): Promise<{
    verdict: "success" | "failure" | "inconclusive";
    confidence: number;
    rationale: string;
  }> {
    const history = params.executedSteps
      .map(
        (s, i) =>
          `${i + 1}. [${s.action}] ${s.selector} (ID: ${s.targetId}) value: ${s.value || "N/A"}`,
      )
      .join("\n");

    const systemPrompt = `
      You are RacTest, a deterministic web test result evaluator.
      Evaluate if the automated test goal succeeded using evidence only.

      Return strict JSON:
      {
        "verdict": "success" | "failure" | "inconclusive",
        "confidence": number,
        "rationale": "short evidence-based reason"
      }

      Rules:
      - Use only the provided contexts and signals.
      - If explicit error evidence exists (alerts, aria-invalid, visual errors), prefer "failure".
      - If goal completion signals are strong and no error evidence exists, return "success".
      - If evidence conflicts or is weak, return "inconclusive".
      - Confidence must be 0..1.
      - Do NOT provide QA commentary, advice, or explanations outside JSON.
      - Output JSON only.
    `;

    const userPrompt = `
      Goal: "${params.goal}"

      Executed steps:
      ${history || "No executed steps"}

      Signals:
      ${JSON.stringify(params.signals, null, 2)}

      Before context:
      ${params.beforeContext || "N/A"}

      After context:
      ${params.afterContext || "N/A"}
    `;

    const openRouterService = await getOpenRouterService();
    const response = await openRouterService.generateCompletion(
      systemPrompt,
      userPrompt,
    );

    try {
      const clean = response.content
        .replace(/<think>[\s\S]*?<\/think>/g, "")
        .trim();
      const jsonMatch =
        clean.match(/```json\n([\s\S]*?)\n```/) ||
        clean.match(/```([\s\S]*?)```/) ||
        clean.match(/\{[\s\S]*\}/);
      const parsed = JSON.parse(jsonMatch?.[1] || jsonMatch?.[0] || clean);
      const verdict =
        parsed?.verdict === "success" ||
        parsed?.verdict === "failure" ||
        parsed?.verdict === "inconclusive"
          ? parsed.verdict
          : "inconclusive";
      const confidenceRaw = Number(parsed?.confidence);
      const confidence = Number.isFinite(confidenceRaw)
        ? Math.max(0, Math.min(1, confidenceRaw))
        : 0.4;
      const rationale =
        typeof parsed?.rationale === "string" && parsed.rationale.trim()
          ? parsed.rationale.trim().slice(0, 260)
          : "Outcome evaluator returned insufficient rationale.";

      return { verdict, confidence, rationale };
    } catch {
      return {
        verdict: "inconclusive",
        confidence: 0.25,
        rationale: "Could not parse outcome-evaluation response.",
      };
    }
  }

  async classifyVisualState(params: {
    goal: string;
    signals: Array<{
      text: string;
      role: string;
      className: string;
      color: string;
      backgroundColor: string;
      borderColor: string;
      ariaLive: string;
      toneHint: "success" | "error" | "warning" | "info" | "neutral";
    }>;
    previousSteps: TestStep[];
  }): Promise<{
    verdict: "error" | "success" | "warning" | "neutral";
    confidence: number;
    rationale: string;
  }> {
    const history = params.previousSteps
      .slice(-8)
      .map(
        (s, i) =>
          `${i + 1}. [${s.action}] ${s.selector} (ID: ${s.targetId}) value: ${s.value || "N/A"}`,
      )
      .join("\n");

    const systemPrompt = `
      You are RacTest visual state classifier for automated testing.
      Determine whether on-screen feedback represents ERROR, SUCCESS, WARNING, or NEUTRAL.

      Return strict JSON:
      {
        "verdict": "error" | "success" | "warning" | "neutral",
        "confidence": number,
        "rationale": "short evidence-based reason"
      }

      Rules:
      - Use text + role + class + color/background metadata together.
      - Do not classify as error just because role="alert" exists.
      - If feedback explicitly indicates successful completion, prefer success.
      - Confidence must be 0..1.
      - Do NOT provide QA commentary, advice, or explanations outside JSON.
      - Output JSON only.
    `;

    const userPrompt = `
      Goal: "${params.goal}"

      Recent executed steps:
      ${history || "No steps"}

      Visual signals:
      ${JSON.stringify(params.signals.slice(0, 20), null, 2)}
    `;

    const openRouterService = await getOpenRouterService();
    const response = await openRouterService.generateCompletion(
      systemPrompt,
      userPrompt,
    );

    try {
      const clean = response.content
        .replace(/<think>[\s\S]*?<\/think>/g, "")
        .trim();
      const jsonMatch =
        clean.match(/```json\n([\s\S]*?)\n```/) ||
        clean.match(/```([\s\S]*?)```/) ||
        clean.match(/\{[\s\S]*\}/);
      const parsed = JSON.parse(jsonMatch?.[1] || jsonMatch?.[0] || clean);
      const verdict =
        parsed?.verdict === "error" ||
        parsed?.verdict === "success" ||
        parsed?.verdict === "warning" ||
        parsed?.verdict === "neutral"
          ? parsed.verdict
          : "neutral";
      const confidenceRaw = Number(parsed?.confidence);
      const confidence = Number.isFinite(confidenceRaw)
        ? Math.max(0, Math.min(1, confidenceRaw))
        : 0.45;
      const rationale =
        typeof parsed?.rationale === "string" && parsed.rationale.trim()
          ? parsed.rationale.trim().slice(0, 220)
          : "No rationale provided by visual classifier.";

      return { verdict, confidence, rationale };
    } catch {
      return {
        verdict: "neutral",
        confidence: 0.25,
        rationale: "Could not parse visual-state classification response.",
      };
    }
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
