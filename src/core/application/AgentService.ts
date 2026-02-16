import type {
  IAgent,
  IAgentLog,
  IDOMMarker,
  IInspector,
  ILLMProvider,
} from "../domain/interfaces";
import type { ConsoleLogEntry, FakeDataType, TestStep } from "../../commons/types";
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
    const capturedConsoleLogs: ConsoleLogEntry[] = [];

    // Subscribe to passive monitoring
    // Note: We need to handle cleanup of this subscription if possible,
    // but for now we assume it persists or we might duplicate listeners if not careful.
    // Ideally inspector.onErrorCaptured should allow unsubscribing.
    // For this refactor, we leave it as is but note the architectural improvement needed.
    this.inspector.onErrorCaptured((error) => {
      const subtype = String(error.subtype || "");
      if (subtype === "CONSOLE" && error.payload && typeof error.payload === "object") {
        const level = String((error.payload as any).level || "log").toLowerCase();
        const message = String((error.payload as any).message || "");
        const preview = `${level}: ${message}`.slice(0, 280);
        const mappedLevel: ConsoleLogEntry["level"] =
          level === "error" ||
          level === "warn" ||
          level === "info" ||
          level === "debug" ||
          level === "log"
            ? level
            : "log";
        capturedConsoleLogs.push({
          timestamp: Number((error.payload as any).timestamp || Date.now()),
          level: mappedLevel,
          message,
          stack:
            typeof (error.payload as any).stack === "string"
              ? (error.payload as any).stack
              : undefined,
        });

        if (level === "error") {
          this.log("error", `🚨 Console Error: ${preview}`);
          reportGen.addError("console", error.payload);
          this.lastOutcome = "error_detected";
        } else if (level === "warn") {
          this.log("info", `⚠️ Console Warn: ${preview}`);
          reportGen.addError("console", error.payload);
        } else {
          this.log("info", `🪵 Console ${level}: ${preview}`);
        }
        return;
      }

      const preview = JSON.stringify(error.payload).substring(0, 200);
      this.log("error", `🚨 Page Error [${error.subtype}]: ${preview}`);
      capturedConsoleLogs.push({
        timestamp: Number(error.timestamp || Date.now()),
        level: "error",
        message: `[${subtype || "UNKNOWN"}] ${preview}`,
      });
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

    // Fetch configuration (Autopilot now uses a single adaptive pipeline)
    const { storageService } = await import("../../commons/lib/storage");
    const settings = await storageService.getSettings();
    const AI_AVAILABLE =
      settings.enableAiForTesting !== false && !!settings.openRouterApiKey;
    const MAX_STEPS = settings.agentMaxSteps || 20;
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
    let previousMarkedContext = "";
    let currentElementMetaMap = new Map<number, { tag: string; raw: string }>();
    let unchangedCycles = 0;
    let lastVisualSignature = "";
    let fillFirstStrategy = this.shouldUseFillFirstStrategy(goal);
    let hasSubmittedCriticalAction = false;

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
        const adaptiveMode = this.pickAdaptiveReadMode(
          unchangedCycles,
          reportGen.getReport().stepsExecuted,
        );
        this.log("thinking", `👀 Analyzing page (${adaptiveMode} adaptive)...`);
        await this.domMarker.markInteractiveElements(profileId, adaptiveMode);
        const markedContext = await this.domMarker.getMarkedContext(profileId);
        currentMarkedContext = this.compactContext(markedContext, previousMarkedContext);
        currentElementMetaMap = this.extractElementMetaMap(markedContext);
        const formProgress = this.getFormProgress(markedContext);
        if (
          formProgress.totalControls >= 4 &&
          reportGen.getReport().stepsExecuted <= 1
        ) {
          fillFirstStrategy = true;
        }

        const currentDomHash = this.computeHash(markedContext);
        const isDomUnchanged =
          currentDomHash === this.lastDomHash && this.lastDomHash !== "";
        this.lastDomHash = currentDomHash;
        unchangedCycles = isDomUnchanged ? unchangedCycles + 1 : 0;
        const currentContextLength = markedContext.length;
        const currentModalFlag = this.hasModalSignals(markedContext);

        if (isDomUnchanged) {
          this.log("info", "⚠️ DOM hasn't changed since last step.");
        }

        this.log(
          "info",
          `🔍 Context size: ${markedContext.length} chars ${isDomUnchanged ? "(Unchanged)" : ""}`,
        );

        const previousSteps = reportGen.getReport().steps;

        // 2.2 Check for Visual Errors
        const visualErrors = await this.domMarker.detectVisualErrors();
        const visualSignals = await this.domMarker.getVisualSignals();
        const hasVisualFeedback = visualErrors.length > 0 || visualSignals.length > 0;
        if (hasVisualFeedback) {
          const visualSignature = this.computeHash(
            JSON.stringify({
              visualErrors,
              visualSignals: visualSignals.map((s) => ({
                text: s.text,
                role: s.role,
                className: s.className,
                toneHint: s.toneHint,
              })),
            }),
          );
          const visualChanged = visualSignature !== lastVisualSignature;
          lastVisualSignature = visualSignature;

            if (visualChanged) {
            const deterministicVisualDecision =
              this.classifyVisualStateDeterministic({
                visualErrors,
                visualSignals,
              });
            const visualDecision =
              deterministicVisualDecision.verdict !== "neutral" ||
              !AI_AVAILABLE
                ? deterministicVisualDecision
                : await this.llmProvider.classifyVisualState({
                    goal,
                    signals: visualSignals,
                    previousSteps,
                  });

            if (
              visualDecision.verdict === "error" &&
              visualDecision.confidence >= 0.55
            ) {
              if (fillFirstStrategy && !hasSubmittedCriticalAction) {
                this.log(
                  "info",
                  `⏭️ Fill-first active: postponing visual error evaluation until submit. (${visualDecision.confidence.toFixed(2)})`,
                );
                this.lastOutcome = isDomUnchanged ? "no_effect" : "progress";
              } else {
                this.lastOutcome = "error_detected";
                const newVisualErrors = visualErrors.filter((err) => {
                  const normalized = err.trim();
                  if (!normalized) return false;
                  if (knownVisualErrors.has(normalized)) return false;
                  knownVisualErrors.add(normalized);
                  return true;
                });

                if (newVisualErrors.length === 0) {
                  const aiError = `[AI_VISUAL] ${visualDecision.rationale}`;
                  if (!knownVisualErrors.has(aiError)) {
                    knownVisualErrors.add(aiError);
                    newVisualErrors.push(aiError);
                  }
                }

                newVisualErrors.forEach((err) => {
                  this.log("error", `🚨 Visual Error Detected: ${err}`);
                  reportGen.addError("visual", err);
                });

                if (lastExecutedWasCriticalCommit) {
                  const stopReason =
                    "Se detectó error visual tras acción crítica (submit/save).";
                  this.log("error", `❌ ${stopReason}`);
                  reportGen.addError("visual", stopReason);
                  reportGen.setStatus("FAILED");
                  break;
                }
              }
            } else if (visualDecision.verdict === "success") {
              this.log(
                "info",
                `✅ Visual feedback classified as success (${visualDecision.confidence.toFixed(2)}): ${visualDecision.rationale}`,
              );
            } else if (visualDecision.verdict === "warning") {
              this.log(
                "info",
                `⚠️ Visual feedback warning (${visualDecision.confidence.toFixed(2)}): ${visualDecision.rationale}`,
              );
            }
          }
        } else if (reportGen.getReport().stepsExecuted > 0) {
          this.lastOutcome = isDomUnchanged ? "no_effect" : "progress";
        }

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
            `execution_strategy=${fillFirstStrategy && !hasSubmittedCriticalAction ? "fill_then_validate" : "balanced"}`,
            `form_controls_total=${formProgress.totalControls}`,
            `form_controls_filled=${formProgress.filledControls}`,
            `steps_executed=${reportGen.getReport().stepsExecuted}`,
            `last_outcome=${this.lastOutcome}`,
            `remaining_budget=${MAX_STEPS - reportGen.getReport().stepsExecuted}`,
          ].join("; ");

          const newPlan = await this.llmProvider.generateSteps(
            `${fillFirstStrategy ? "[FORM_FILL_FIRST] " : ""}[FULL_PLAN] GOAL: ${goal}. Build an end-to-end executable map with ordered steps using provided IDs.`,
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
          const verification = await this.verifyFinalOutcome({
            goal,
            profileId,
            beforeContext: currentMarkedContext,
            visualErrors,
            executedSteps: previousSteps,
            allowAI: AI_AVAILABLE,
          });
          if (verification.verdict === "failure") {
            this.log(
              "error",
              `❌ Final QA verdict: FAILURE (${verification.confidence.toFixed(2)}) - ${verification.rationale}`,
            );
            reportGen.addError("visual", verification.rationale);
            reportGen.setStatus("FAILED");
          } else if (verification.verdict === "inconclusive") {
            this.log(
              "info",
              `⚠️ Final QA verdict: INCONCLUSIVE (${verification.confidence.toFixed(2)}) - ${verification.rationale}`,
            );
            reportGen.setStatus("FAILED");
          } else {
            this.log(
              "success",
              `✅ Final QA verdict: SUCCESS (${verification.confidence.toFixed(2)})`,
            );
            reportGen.setStatus("COMPLETED");
          }
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
          previousMarkedContext = markedContext;
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
          if (lastExecutedWasCriticalCommit) {
            hasSubmittedCriticalAction = true;
          }
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
        previousMarkedContext = markedContext;
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
      await this.saveHistory(finalReport, stepResults, capturedConsoleLogs);
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

  private pickAdaptiveReadMode(
    unchangedCycles: number,
    stepsExecuted: number,
  ): "fast" | "normal" | "complex" {
    if (stepsExecuted === 0) return "normal";
    if (unchangedCycles >= 2) return "complex";
    if (unchangedCycles === 0 && stepsExecuted > 2) return "fast";
    return "normal";
  }

  private compactContext(current: string, previous: string): string {
    const MAX_LINES = 280;
    const MAX_CHARS = 12000;

    const currentLines = current.split("\n").filter((l) => l.trim().length > 0);
    const previousSet = new Set(
      previous
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean),
    );

    const changedLines = currentLines.filter((line) => !previousSet.has(line.trim()));
    const prioritized = [...changedLines, ...currentLines].slice(0, MAX_LINES);
    const compacted = prioritized.join("\n");
    return compacted.length > MAX_CHARS
      ? compacted.slice(0, MAX_CHARS) + "\n...[truncated]"
      : compacted;
  }

  private shouldUseFillFirstStrategy(goal: string): boolean {
    return /(form|formulario|registro|register|signup|sign up|create user|crear usuario|fill|llenar)/i.test(
      goal,
    );
  }

  private getFormProgress(markedContext: string): {
    totalControls: number;
    filledControls: number;
  } {
    const lines = markedContext.split("\n");
    let totalControls = 0;
    let filledControls = 0;

    for (const rawLine of lines) {
      const line = rawLine.toLowerCase();
      const isControl =
        /<input|<textarea|<select/.test(line) ||
        /(placeholder=|type=|name=)/.test(line);
      if (!isControl) continue;
      totalControls++;

      const valueMatch = line.match(/value="([^"]*)"/);
      const value = (valueMatch?.[1] || "").trim();
      const selectSelectedMatch = line.match(/selected="([^"]*)"/);
      const selected = (selectSelectedMatch?.[1] || "").trim();
      if (value || selected) {
        filledControls++;
      }
    }

    return { totalControls, filledControls };
  }

  private extractNewErrorKeywords(
    beforeContext: string,
    afterContext: string,
  ): string[] {
    const keywordRegex =
      /\b(error|failed|invalid|required|incorrect|denied|forbidden|rechazad|invalido|incorrecto|obligatorio|fallo)\b/gi;
    const beforeMatches = new Set(
      Array.from(beforeContext.matchAll(keywordRegex)).map((m) =>
        (m[0] || "").toLowerCase(),
      ),
    );
    const afterMatches = Array.from(afterContext.matchAll(keywordRegex)).map((m) =>
      (m[0] || "").toLowerCase(),
    );
    const newKeywords = afterMatches.filter((k) => !beforeMatches.has(k));
    return [...new Set(newKeywords)].slice(0, 20);
  }

  private classifyVisualStateDeterministic(params: {
    visualErrors: string[];
    visualSignals: Array<{
      text: string;
      role: string;
      className: string;
      color: string;
      backgroundColor: string;
      borderColor: string;
      ariaLive: string;
      toneHint: "success" | "error" | "warning" | "info" | "neutral";
    }>;
  }): {
    verdict: "error" | "success" | "warning" | "neutral";
    confidence: number;
    rationale: string;
  } {
    let score = 0;
    const failureRegex =
      /(failed|error|invalid|required|denied|timeout|degraded|fall[óo]|invalido|rechazad)/i;
    const successRegex =
      /(success|successful|created|saved|completed|welcome|exito|guardado|completado)/i;

    if (params.visualErrors.length > 0) score += 4;

    for (const s of params.visualSignals) {
      const blob = `${s.text} ${s.className} ${s.role} ${s.ariaLive}`.toLowerCase();
      if (s.toneHint === "error") score += 3;
      if (s.toneHint === "success") score -= 3;
      if (failureRegex.test(blob)) score += 3;
      if (successRegex.test(blob)) score -= 3;
      if (/alert/.test((s.role || "").toLowerCase()) && failureRegex.test(blob)) {
        score += 2;
      }
      if (
        /status/.test((s.role || "").toLowerCase()) &&
        !s.text.trim() &&
        /(spinner|loading|loader|progress)/i.test(s.className || "")
      ) {
        score -= 1;
      }
    }

    if (score >= 4) {
      return {
        verdict: "error",
        confidence: Math.min(0.95, 0.55 + Math.abs(score) * 0.05),
        rationale: "Deterministic signals indicate visual error state.",
      };
    }
    if (score <= -4) {
      return {
        verdict: "success",
        confidence: Math.min(0.95, 0.55 + Math.abs(score) * 0.05),
        rationale: "Deterministic signals indicate visual success state.",
      };
    }
    if (score >= 2) {
      return {
        verdict: "warning",
        confidence: 0.6,
        rationale: "Deterministic signals suggest possible warning.",
      };
    }
    return {
      verdict: "neutral",
      confidence: 0.45,
      rationale: "Deterministic signals are weak or mixed.",
    };
  }

  private async verifyFinalOutcome(params: {
    goal: string;
    profileId: string;
    beforeContext: string;
    visualErrors: string[];
    executedSteps: TestStep[];
    allowAI: boolean;
  }): Promise<{
    verdict: "success" | "failure" | "inconclusive";
    confidence: number;
    rationale: string;
  }> {
    this.log("thinking", "🧪 Running final QA verification...");
    await this.domMarker.waitForDOMStability(1200);
    await this.domMarker.markInteractiveElements(params.profileId, "complex");
    const afterRawContext = await this.domMarker.getMarkedContext(params.profileId);
    const afterContext = this.compactContext(afterRawContext, params.beforeContext);
    const afterVisualErrors = await this.domMarker.detectVisualErrors();
    const outcomeSignals = await this.domMarker.getOutcomeSignals();
    const visualSignals = await this.domMarker.getVisualSignals();
    const visualDecision = visualSignals.length
      ? await this.llmProvider.classifyVisualState({
          goal: params.goal,
          signals: visualSignals,
          previousSteps: params.executedSteps,
        })
      : { verdict: "neutral" as const, confidence: 0.5, rationale: "No visual signals." };

    const newVisualErrors =
      visualDecision.verdict === "error"
        ? afterVisualErrors.filter((err) => !params.visualErrors.includes(err))
        : [];
    const newErrorKeywords = this.extractNewErrorKeywords(
      params.beforeContext,
      afterContext,
    );
    const deterministicVisual = this.classifyVisualStateDeterministic({
      visualErrors: afterVisualErrors,
      visualSignals,
    });
    const deterministicScore =
      (newVisualErrors.length > 0 ? 3 : 0) +
      (newErrorKeywords.length > 0 ? 3 : 0) +
      (deterministicVisual.verdict === "error"
        ? 3
        : deterministicVisual.verdict === "success"
          ? -3
          : 0);
    if (deterministicScore >= 4) {
      return {
        verdict: "failure",
        confidence: 0.82,
        rationale:
          newVisualErrors[0] ||
          deterministicVisual.rationale ||
          "Deterministic final verification found failure signals.",
      };
    }
    if (deterministicScore <= -3) {
      return {
        verdict: "success",
        confidence: 0.78,
        rationale:
          deterministicVisual.rationale ||
          "Deterministic final verification found success signals.",
      };
    }
    if (!params.allowAI) {
      return {
        verdict: "inconclusive",
        confidence: 0.5,
        rationale: "Final deterministic verification is inconclusive (no AI fallback available).",
      };
    }

    const finalEvalPayload = {
      goal: params.goal,
      beforeContextLength: params.beforeContext.length,
      afterContextLength: afterContext.length,
      signals: {
        visualErrors:
          visualDecision.verdict === "error"
            ? [...newVisualErrors, `[AI_VISUAL] ${visualDecision.rationale}`]
            : [],
        outcomeSignals,
        newErrorKeywords,
        domChanged:
          this.computeHash(params.beforeContext) !== this.computeHash(afterContext),
      },
      executedSteps: params.executedSteps.map((s) => ({
        action: s.action,
        targetId: s.targetId,
        selector: s.selector,
      })),
      beforePreview: params.beforeContext.slice(0, 1200),
      afterPreview: afterContext.slice(0, 1200),
    };
    console.debug("[RacTest][Autopilot][AI Final Eval Payload]", finalEvalPayload);

    return this.llmProvider.evaluateOutcome({
      goal: params.goal,
      beforeContext: params.beforeContext,
      afterContext,
      signals: {
        visualErrors: finalEvalPayload.signals.visualErrors,
        outcomeSignals: finalEvalPayload.signals.outcomeSignals,
        newErrorKeywords: finalEvalPayload.signals.newErrorKeywords,
        domChanged: finalEvalPayload.signals.domChanged,
      },
      executedSteps: params.executedSteps,
    });
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
      tag !== "input" &&
      !/role="checkbox"/.test(elementMeta?.raw || "")
    ) {
      // Allow non-input wrappers (label/div) because execution can resolve nested checkbox/radio.
      return null;
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
  ): FakeDataType {
    if (/first.?name|nombre(?!.*apellido)/.test(rawContext)) return "firstName";
    if (/last.?name|surname|apellido/.test(rawContext)) return "lastName";
    if (/email|e-mail|correo/.test(rawContext)) return "email";
    if (/user(name)?|login|usuario/.test(rawContext)) return "username";
    if (/pass(word)?|contrase/.test(rawContext)) return "password";
    if (/phone|tel|mobile|cel/.test(rawContext)) return "phone";
    if (/address|direcci/.test(rawContext)) return "address";
    if (/city|ciudad/.test(rawContext)) return "city";
    if (/state|province|provincia|estado/.test(rawContext)) return "state";
    if (/zip|postal|cp|codigo postal/.test(rawContext)) return "zipCode";
    if (/country|pais/.test(rawContext)) return "country";
    if (/company|empresa/.test(rawContext)) return "company";
    if (/job|position|cargo|puesto/.test(rawContext)) return "jobTitle";
    if (/website|site|url|web/.test(rawContext)) return "url";
    if (/datetime|fecha y hora|timestamp/.test(rawContext)) return "datetime";
    if (/hora|time/.test(rawContext)) return "time";
    if (/amount|monto|precio|price|cost/.test(rawContext)) return "price";
    if (/uuid|guid|folio|id unico/.test(rawContext)) return "uuid";
    if (/color|hex/.test(rawContext)) return "color";
    if (/cantidad|numero|number|age|edad/.test(rawContext)) return "number";
    if (/date|fecha|birth|nacimiento/.test(rawContext)) return "date";
    if (/name|nombre|first|last/.test(rawContext)) return "name";
    return "lorem";
  }

  private generateFakeValue(type: FakeDataType): string {
    const stamp = Date.now().toString().slice(-6);
    switch (type) {
      case "firstName":
        return `Nombre${stamp}`;
      case "lastName":
        return `Apellido${stamp}`;
      case "email":
        return `ractest.${stamp}@example.com`;
      case "username":
        return `user_${stamp}`;
      case "password":
        return `Rac!${stamp}Test`;
      case "phone":
        return `55${stamp}`;
      case "address":
        return `Calle Test ${stamp}`;
      case "city":
        return `Ciudad ${stamp}`;
      case "state":
        return `Estado ${stamp}`;
      case "zipCode":
        return `${stamp.slice(0, 5)}`;
      case "country":
        return "México";
      case "company":
        return `RacTest Co ${stamp}`;
      case "jobTitle":
        return `QA Engineer ${stamp}`;
      case "url":
        return `https://example.com/${stamp}`;
      case "date":
        return new Date().toISOString().slice(0, 10);
      case "time":
        return "10:30";
      case "datetime":
        return new Date().toISOString().slice(0, 16);
      case "number":
        return `${Number(stamp) % 1000}`;
      case "price":
        return `${(Number(stamp) % 5000) + 99}.99`;
      case "uuid":
        return crypto.randomUUID();
      case "color":
        return "#3366FF";
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
    consoleLogs: ConsoleLogEntry[] = [],
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
        consoleLogs,
      };

      const { storageService } = await import("../../commons/lib/storage");
      await storageService.addToHistory(historyEntry);
      this.log("success", "💾 Run saved to History.");
    } catch (err) {
      this.log("error", "Failed to save history: " + err);
    }
  }
}
