import type {
  IAgent,
  IAgentLog,
  IDOMMarker,
  IInspector,
  ILLMProvider,
} from "../domain/interfaces";
import type { TestStep } from "../../commons/types";
import { ReportGenerator } from "./ReportGenerator";

export class AgentService implements IAgent {
  private _isRunning = false;
  private logCallback: ((log: IAgentLog) => void) | null = null;
  private stopRequested = false;
  private lastDomHash: string = "";

  private inspector: IInspector;
  private llmProvider: ILLMProvider;
  private domMarker: IDOMMarker;
  private lastOutcome: "unknown" | "progress" | "no_effect" | "error_detected" =
    "unknown";

  constructor(
    inspector: IInspector,
    llmProvider: ILLMProvider,
    domMarker: IDOMMarker,
  ) {
    this.inspector = inspector;
    this.llmProvider = llmProvider;
    this.domMarker = domMarker;
  }

  public setLogCallback(callback: (log: IAgentLog) => void) {
    this.logCallback = callback;
  }

  private log(type: IAgentLog["type"], message: string) {
    if (this.logCallback) {
      this.logCallback({
        id: crypto.randomUUID(),
        timestamp: Date.now(),
        type,
        message,
      });
    }
  }

  public stop() {
    this.stopRequested = true;
    this._isRunning = false; // Immediately flag
    this.log("info", "🛑 Requesting stop...");
  }

  public isRunning(): boolean {
    return this._isRunning;
  }

  public async start(goal: string, profileId: string) {
    if (this._isRunning) return;
    this._isRunning = true;
    this.stopRequested = false;
    this.lastDomHash = "";
    this.lastOutcome = "unknown";

    // Report Initialization
    const reportGen = new ReportGenerator(goal);
    const stepResults: Array<{
      stepId: string;
      status: "success" | "error";
      timestamp: number;
      message?: string;
    }> = [];
    let fatalRuntimeError: string | null = null;
    const knownVisualErrors = new Set<string>();
    let lastExecutedWasCriticalCommit = false;

    // Subscribe to passive monitoring
    // Note: We need to handle cleanup of this subscription if possible,
    // but for now we assume it persists or we might duplicate listeners if not careful.
    // Ideally inspector.onErrorCaptured should allow unsubscribing.
    // For this refactor, we leave it as is but note the architectural improvement needed.
    this.inspector.onErrorCaptured((error) => {
      const preview = JSON.stringify(error.payload).substring(0, 200);
      this.log("error", `🚨 Page Error [${error.subtype}]: ${preview}`);
      reportGen.addError(
        error.subtype === "NETWORK" ? "network" : "console",
        error.payload,
      );

      const fatalSubtypes = new Set(["NETWORK", "WINDOW", "PROMISE"]);
      if (fatalSubtypes.has(String(error.subtype || ""))) {
        fatalRuntimeError = `Fatal runtime error [${error.subtype}] ${preview}`;
        this.lastOutcome = "error_detected";
      }
    });

    this.log("info", `🚀 Agent started. Goal: "${goal}"`);

    // Fetch configuration
    const { storageService } = await import("../../commons/lib/storage");
    const settings = await storageService.getSettings();
    const MAX_STEPS = settings.agentMaxSteps || 20;
    const READING_MODE = settings.readingMode || "normal";
    const AGENT_MODE = settings.agentMode || "strict_fail_fast";
    const MAX_RETRIES_NON_CRITICAL =
      settings.maxRetriesNonCritical !== undefined
        ? Math.max(0, Math.min(3, settings.maxRetriesNonCritical))
        : 0;
    // Use user setting or default to 1000ms. If explicitly 0, use 0.
    const STEP_DELAY =
      settings.defaultDelay !== undefined ? settings.defaultDelay : 1000;
    const EFFECTIVE_STEP_DELAY = Math.min(Math.max(STEP_DELAY, 0), 300);
    const STABILITY_TIMEOUT = Math.min(Math.max(STEP_DELAY, 700), 1500);
    const retryByStepKey = new Map<string, number>();
    const MAX_REPLANS = 2;
    let plannedSteps: TestStep[] = [];
    let plannedIndex = 0;
    let replanCount = 0;
    let previousContextLength = 0;
    let previousContextModalFlag = false;
    let currentMarkedContext = "";
    let currentElementMetaMap = new Map<number, { tag: string; raw: string }>();

    try {
      while (reportGen.getReport().stepsExecuted < MAX_STEPS) {
        if (this.shouldStop(reportGen)) break;
        if (fatalRuntimeError) {
          this.log("error", `❌ ${fatalRuntimeError}`);
          reportGen.addError("console", fatalRuntimeError);
          reportGen.setStatus("FAILED");
          break;
        }

        if (this.shouldStop(reportGen)) break;
        this.log("thinking", "⏳ Waiting for page stability...");
        await this.domMarker.waitForDOMStability(STABILITY_TIMEOUT);
        if (this.shouldStop(reportGen)) break;
        this.log("thinking", `👀 Analyzing page (${READING_MODE} mode)...`);
        await this.domMarker.markInteractiveElements(profileId, READING_MODE);
        const markedContext = await this.domMarker.getMarkedContext(profileId);
        currentMarkedContext = markedContext;
        currentElementMetaMap = this.extractElementMetaMap(markedContext);

        const currentDomHash = this.computeHash(markedContext);
        const isDomUnchanged =
          currentDomHash === this.lastDomHash && this.lastDomHash !== "";
        this.lastDomHash = currentDomHash;
        const currentContextLength = markedContext.length;
        const currentModalFlag = this.hasModalSignals(markedContext);

        if (isDomUnchanged) {
          this.log("info", "⚠️ DOM hasn't changed since last step.");
        }

        this.log(
          "info",
          `🔍 Context size: ${markedContext.length} chars ${isDomUnchanged ? "(Unchanged)" : ""}`,
        );

        // 2.2 Check for Visual Errors
        const visualErrors = await this.domMarker.detectVisualErrors();
        if (visualErrors.length > 0) {
          this.lastOutcome = "error_detected";
          const newVisualErrors = visualErrors.filter((err) => {
            const normalized = err.trim();
            if (!normalized) return false;
            if (knownVisualErrors.has(normalized)) return false;
            knownVisualErrors.add(normalized);
            return true;
          });

          newVisualErrors.forEach((err) => {
            this.log("error", `🚨 Visual Error Detected: ${err}`);
            reportGen.addError("visual", err);
          });

          if (
            newVisualErrors.length > 0 &&
            reportGen.getReport().stepsExecuted > 0
          ) {
            const stopReason = lastExecutedWasCriticalCommit
              ? "Se detectó error visual tras acción crítica (submit/save)."
              : "Se detectó error visual durante la ejecución.";
            if (
              lastExecutedWasCriticalCommit ||
              AGENT_MODE === "strict_fail_fast"
            ) {
              this.log("error", `❌ ${stopReason}`);
              reportGen.addError("visual", stopReason);
              reportGen.setStatus("FAILED");
              break;
            } else {
              this.log("info", `⚠️ ${stopReason} (modo balanced)`);
            }
          }
        } else if (reportGen.getReport().stepsExecuted > 0) {
          this.lastOutcome = isDomUnchanged ? "no_effect" : "progress";
        }

        const previousSteps = reportGen.getReport().steps;
        const nextPlannedStep = plannedSteps[plannedIndex];
        const requiresReplan =
          plannedSteps.length === 0 ||
          plannedIndex >= plannedSteps.length ||
          this.shouldReplan(
            isDomUnchanged,
            previousContextLength,
            currentContextLength,
            previousContextModalFlag,
            currentModalFlag,
            nextPlannedStep,
            currentElementMetaMap,
          );

        if (requiresReplan) {
          if (plannedSteps.length > 0) {
            replanCount++;
            if (replanCount > MAX_REPLANS) {
              const reason = "Maximum replan attempts reached.";
              this.log("error", `❌ ${reason}`);
              reportGen.addError("console", reason);
              reportGen.setStatus("FAILED");
              break;
            }
            this.log("info", `🔄 Replanning... (${replanCount}/${MAX_REPLANS})`);
          } else {
            this.log("thinking", "🧠 Generating initial execution map...");
          }

          const context = [
            `planner_mode=full_plan`,
            `steps_executed=${reportGen.getReport().stepsExecuted}`,
            `last_outcome=${this.lastOutcome}`,
            `remaining_budget=${MAX_STEPS - reportGen.getReport().stepsExecuted}`,
          ].join("; ");

          const newPlan = await this.llmProvider.generateSteps(
            `[FULL_PLAN] GOAL: ${goal}. Build an end-to-end executable map with ordered steps using provided IDs.`,
            context,
            currentMarkedContext,
            previousSteps,
          );

          if (!newPlan || newPlan.length === 0) {
            this.log("error", "AI returned an empty execution map. Stopping.");
            reportGen.setStatus("FAILED");
            break;
          }

          plannedSteps = newPlan;
          plannedIndex = 0;
          this.log("info", `🗺️ Plan ready with ${plannedSteps.length} steps.`);
        }

        const nextStep = plannedSteps[plannedIndex];
        plannedIndex++;
        this.log("thinking", "🧠 Executing mapped step...");

        if (nextStep.thought) {
          this.log("thinking", `💭 Thought: ${nextStep.thought}`);
        }

        if (nextStep.action === "FINISH") {
          this.log("success", "✅ Agent finished (Goal Achieved).");
          reportGen.setStatus("COMPLETED");
          break;
        }

        // Loop detection
        if (this.detectLoop(previousSteps, nextStep)) {
          this.log(
            "info",
            `⚠️ Detected recursive loop. Stopping to avoid infinite execution.`,
          );
          reportGen.setStatus("FAILED"); // Or completed? Failed seems safer for loops.
          break;
        }

        const preconditionError = this.validateStepPreconditions(
          nextStep,
          currentElementMetaMap,
        );
        if (preconditionError) {
          this.log("error", `❌ Invalid generated step: ${preconditionError}`);
          reportGen.addError("console", preconditionError);
          reportGen.setStatus("FAILED");
          stepResults.push({
            stepId: nextStep.id,
            status: "error",
            timestamp: Date.now(),
            message: preconditionError,
          });
          break;
        }

        this.resolveStepData(nextStep, currentElementMetaMap);

        const lastExecuted = previousSteps[previousSteps.length - 1];
        const currentStepKey = this.getStepKey(nextStep);
        if (
          (this.lastOutcome === "no_effect" ||
            this.lastOutcome === "error_detected") &&
          lastExecuted &&
          lastExecuted.action === nextStep.action &&
          lastExecuted.targetId === nextStep.targetId
        ) {
          const retriesUsed = retryByStepKey.get(currentStepKey) || 0;
          if (retriesUsed >= MAX_RETRIES_NON_CRITICAL) {
            const repeatedNoEffectError =
              "Repeated same action+target after no_effect/error outcome";
            this.log("error", `❌ ${repeatedNoEffectError}`);
            reportGen.addError("console", repeatedNoEffectError);
            reportGen.setStatus("FAILED");
            stepResults.push({
              stepId: nextStep.id,
              status: "error",
              timestamp: Date.now(),
              message: repeatedNoEffectError,
            });
            break;
          }

          retryByStepKey.set(currentStepKey, retriesUsed + 1);
          this.log(
            "info",
            `🔁 Reintento no crítico ${retriesUsed + 1}/${MAX_RETRIES_NON_CRITICAL} para ${nextStep.action} [${nextStep.targetId}]`,
          );
          plannedIndex = Math.max(plannedIndex - 1, 0);
          previousContextLength = currentContextLength;
          previousContextModalFlag = currentModalFlag;
          continue;
        } else {
          retryByStepKey.set(currentStepKey, 0);
        }

        // 4. Act
        if (this.shouldStop(reportGen)) break;

        try {
          lastExecutedWasCriticalCommit = this.isCriticalCommitAction(
            nextStep,
            currentElementMetaMap,
          );
          if (nextStep.targetId) {
            this.log(
              "action",
              `👉 Executing: ${nextStep.action} on ID [${nextStep.targetId}]`,
            );
            await this.domMarker.executeActionOnMarkedElement(
              profileId,
              nextStep.targetId,
              nextStep.action as any,
              nextStep.value,
            );
          } else {
            this.log(
              "action",
              `👉 Executing: ${nextStep.action} on ${nextStep.selector}`,
            );
            await this.inspector.executeStep(nextStep);
          }

          reportGen.addStep(nextStep);
          stepResults.push({
            stepId: nextStep.id,
            status: "success",
            timestamp: Date.now(),
            message: "Step executed",
          });
          this.log("success", "✅ Step executed.");
          if (EFFECTIVE_STEP_DELAY > 0) {
            await new Promise((r) => setTimeout(r, EFFECTIVE_STEP_DELAY));
          }
        } catch (execErr) {
          const execMessage =
            execErr instanceof Error ? execErr.message : String(execErr);
          this.log("error", `❌ Step failed: ${execMessage}`);
          reportGen.addError("console", execMessage);
          reportGen.setStatus("FAILED");
          stepResults.push({
            stepId: nextStep.id,
            status: "error",
            timestamp: Date.now(),
            message: execMessage,
          });
          break;
        }

        previousContextLength = currentContextLength;
        previousContextModalFlag = currentModalFlag;
      }

      // Cleanup
      await this.domMarker.unmarkInteractiveElements(profileId);

      if (reportGen.getReport().stepsExecuted >= MAX_STEPS) {
        this.log("info", "⚠️ Reached maximum steps limit.");
        reportGen.setStatus("FAILED");
      } else if (this.stopRequested) {
        this.log("info", "🛑 Agent stopped by user.");
        reportGen.setStatus("STOPPED");
      } else if (reportGen.getReport().status === "COMPLETED") {
        this.log("success", "🎉 Agent finished successfully.");
      }
    } catch (error: any) {
      this.log("error", `Agent error: ${error.message}`);
      reportGen.setStatus("FAILED");
      reportGen.addError("console", error.message);

      try {
        await this.domMarker.unmarkInteractiveElements(profileId);
      } catch {}
    } finally {
      this._isRunning = false;
      this.stopRequested = false;

      const finalReport = reportGen.finalize();
      this.log("info", `📊 Report generated. Status: ${finalReport.status}`);

      // Save to History
      await this.saveHistory(finalReport, stepResults);
    }
  }

  private shouldStop(reportGen: ReportGenerator): boolean {
    if (this.stopRequested) {
      reportGen.setStatus("STOPPED");
      return true;
    }
    return false;
  }

  private detectLoop(history: any[], nextStep: any): boolean {
    if (history.length < 2) return false;

    // Check for 3 consecutive identical steps (Allow 1 retry, stop on 2nd retry)
    // History: [... Step A, Step A] -> Next: Step A  => LOOP
    const last1 = history[history.length - 1];
    const last2 = history[history.length - 2];

    const isSame = (s1: any, s2: any) =>
      s1.action === s2.action &&
      s1.targetId === s2.targetId &&
      s1.targetId !== undefined;

    if (isSame(last1, nextStep) && isSame(last2, nextStep)) {
      this.log(
        "error",
        `⚠️ Loop detected: Attempting same action (${nextStep.action} on ${nextStep.targetId}) for the 3rd time.`,
      );
      return true;
    }

    // A-B-A-B loop check (Repeating a sequence)
    // History: ... A B A [Next: B]
    if (history.length >= 3) {
      // Check for strictly alternating pattern
      // last1=A, last2=B, last3=A. Next=B.
      const last3 = history[history.length - 3];

      if (
        isSame(last1, last3) && // A == A
        isSame(last2, nextStep) // B == Next(B)
      ) {
        this.log(
          "error",
          `⚠️ Loop detected: Oscillating pattern found (${nextStep.action}).`,
        );
        return true;
      }
    }

    return false;
  }

  private computeHash(str: string): string {
    let hash = 0;
    if (str.length === 0) return hash.toString();
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash | 0; // Convert to 32bit integer
    }
    return hash.toString();
  }

  private extractElementMetaMap(
    markedContext: string,
  ): Map<number, { tag: string; raw: string }> {
    const map = new Map<number, { tag: string; raw: string }>();
    const lines = markedContext.split("\n");
    for (const line of lines) {
      const match = line.match(/^\[(\d+)\]\s*<([a-zA-Z0-9_-]+)/);
      if (!match) continue;
      const id = Number(match[1]);
      const tag = match[2].toLowerCase();
      if (Number.isFinite(id)) map.set(id, { tag, raw: line.toLowerCase() });
    }
    return map;
  }

  private validateStepPreconditions(
    step: TestStep,
    elementMetaMap: Map<number, { tag: string; raw: string }>,
  ): string | null {
    if (step.action === "FINISH") return null;
    if (!step.targetId || step.targetId <= 0) {
      return "Missing valid targetId for non-FINISH action";
    }

    const elementMeta = elementMetaMap.get(step.targetId);
    const tag = elementMeta?.tag;
    if (!tag) return null; // If map misses element, let runtime attempt execution.

    if (step.action === "TYPE" && !["input", "textarea"].includes(tag)) {
      return `TYPE action on non-text element <${tag}>`;
    }

    if (step.action === "SELECT" && tag !== "select") {
      return `SELECT action on non-select element <${tag}>`;
    }

    if (
      (step.action === "CHECK" || step.action === "UNCHECK") &&
      tag !== "input"
    ) {
      return `${step.action} action on non-input element <${tag}>`;
    }

    if (step.action === "SELECT" && !step.value?.trim()) {
      return "SELECT action missing value";
    }

    return null;
  }

  private isCriticalCommitAction(
    step: TestStep,
    elementMetaMap: Map<number, { tag: string; raw: string }>,
  ): boolean {
    if (step.action !== "CLICK" || !step.targetId) return false;
    const meta = elementMetaMap.get(step.targetId);
    if (!meta) return false;
    const commitPattern =
      /(submit|save|guardar|continuar|continue|enviar|finish|finalizar|create|crear|checkout|confirm)/i;
    return commitPattern.test(meta.raw);
  }

  private resolveStepData(
    step: TestStep,
    elementMetaMap: Map<number, { tag: string; raw: string }>,
  ): void {
    if (step.action !== "TYPE") return;
    if (step.value?.trim()) return;

    const raw = step.targetId ? elementMetaMap.get(step.targetId)?.raw || "" : "";
    const type = this.inferDataTypeFromContext(raw);
    step.useFakeData = true;
    step.fakeDataType = type;
    step.value = this.generateFakeValue(type);
  }

  private inferDataTypeFromContext(
    rawContext: string,
  ): "name" | "email" | "phone" | "address" | "company" | "date" | "lorem" {
    if (/email|e-mail|correo/.test(rawContext)) return "email";
    if (/phone|tel|mobile|cel/.test(rawContext)) return "phone";
    if (/address|direcci/.test(rawContext)) return "address";
    if (/company|empresa/.test(rawContext)) return "company";
    if (/date|fecha|birth|nacimiento/.test(rawContext)) return "date";
    if (/name|nombre|first|last/.test(rawContext)) return "name";
    return "lorem";
  }

  private generateFakeValue(
    type: "name" | "email" | "phone" | "address" | "company" | "date" | "lorem",
  ): string {
    const stamp = Date.now().toString().slice(-6);
    switch (type) {
      case "email":
        return `ractest.${stamp}@example.com`;
      case "phone":
        return `55${stamp}`;
      case "address":
        return `Calle Test ${stamp}`;
      case "company":
        return `RacTest Co ${stamp}`;
      case "date":
        return new Date().toISOString().slice(0, 10);
      case "name":
        return `Tester ${stamp}`;
      default:
        return `Dato de prueba ${stamp}`;
    }
  }

  private shouldReplan(
    isDomUnchanged: boolean,
    previousContextLength: number,
    currentContextLength: number,
    previousContextModalFlag: boolean,
    currentContextModalFlag: boolean,
    nextPlannedStep: TestStep | undefined,
    currentElementMetaMap: Map<number, { tag: string; raw: string }>,
  ): boolean {
    if (!nextPlannedStep) return true;

    if (
      nextPlannedStep.targetId &&
      !currentElementMetaMap.has(nextPlannedStep.targetId)
    ) {
      return true;
    }

    if (previousContextLength <= 0) return false;

    const lengthDeltaRatio =
      Math.abs(currentContextLength - previousContextLength) /
      Math.max(previousContextLength, 1);

    if (!isDomUnchanged && lengthDeltaRatio > 0.28) return true;

    if (previousContextModalFlag !== currentContextModalFlag) return true;

    return false;
  }

  private hasModalSignals(markedContext: string): boolean {
    return /(modal|dialog|popup|drawer|overlay)/i.test(markedContext);
  }

  private getStepKey(step: TestStep): string {
    return `${step.action}:${step.targetId || 0}:${step.selector || ""}`;
  }

  private async saveHistory(
    report: any,
    stepResults: Array<{
      stepId: string;
      status: "success" | "error";
      timestamp: number;
      message?: string;
    }>,
  ) {
    try {
      const historyEntry: any = {
        id: report.id,
        recipeId: "agent-autopilot",
        recipeName: `Autopilot: ${report.goal.substring(0, 30)}...`,
        startTime: report.startTime,
        endTime: report.endTime,
        duration: report.durationMs,
        status:
          report.status === "COMPLETED"
            ? "completed"
            : report.status === "STOPPED"
              ? "cancelled"
              : "failed",
        steps: stepResults.map((s) => ({
          stepId: s.stepId,
          status: s.status,
          timestamp: s.timestamp,
          message: s.message,
          duration: 0,
        })),
        errorMessage:
          report.errors.console.length > 0 || report.errors.visual.length > 0
            ? [...report.errors.console, ...report.errors.visual].join("; ")
            : undefined,
      };

      const { storageService } = await import("../../commons/lib/storage");
      await storageService.addToHistory(historyEntry);
      this.log("success", "💾 Run saved to History.");
    } catch (err) {
      this.log("error", "Failed to save history: " + err);
    }
  }
}
