import type {
  IAgent,
  IAgentLog,
  IDOMMarker,
  IInspector,
  ILLMProvider,
} from "../domain/interfaces";
import type {
  AutopilotCycleTelemetry,
  AutopilotTelemetry,
  ConsoleLogEntry,
  FakeDataType,
  TestStep,
} from "../../commons/types";
import { ReportGenerator } from "./ReportGenerator";

interface TelemetryLLMCounters {
  visualCalls: number;
  visualMs: number;
  outcomeCalls: number;
  outcomeMs: number;
}

type SubmitLifecycleState =
  | "filling"
  | "ready_to_commit"
  | "commit_in_flight"
  | "committed"
  | "verified";

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

  private nowMs(): number {
    return typeof performance !== "undefined" ? performance.now() : Date.now();
  }

  private elapsedMs(startMs: number): number {
    return this.roundMs(this.nowMs() - startMs);
  }

  private roundMs(value: number): number {
    return Math.max(0, Math.round(value));
  }

  private incrementCounter(counter: Map<string, number>, key: string) {
    counter.set(key, (counter.get(key) || 0) + 1);
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
    const forcedCommitStepIds = new Set<string>();
    const checkboxStateByTargetId = new Map<number, boolean>();
    const checkboxStateTimestampByTargetId = new Map<number, number>();
    let lastForcedCommitTargetId: number | null = null;
    const CHECKBOX_ANTI_FLIP_WINDOW_MS = 5000;
    const RUN_MEMORY_TTL_MS = 10 * 60 * 1000;
    const runMemory: {
      expiresAt: number;
      lastTouchedAt: number;
      submitState: SubmitLifecycleState;
      lastCommitTargetId: number | null;
    } = {
      expiresAt: Date.now() + RUN_MEMORY_TTL_MS,
      lastTouchedAt: Date.now(),
      submitState: "filling",
      lastCommitTargetId: null,
    };

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
    const AI_AVAILABLE = !!settings.openRouterApiKey;
    const AGENT_MODE: "strict_fail_fast" | "balanced" =
      settings.agentMode === "balanced" ? "balanced" : "strict_fail_fast";
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
    const MAX_HARD_REPLANS = AGENT_MODE === "balanced" ? 6 : 3;
    const replanAttemptsByReason = new Map<string, number>();
    const preconditionRecoveryByStepKey = new Map<string, number>();
    const MAX_PRECONDITION_RECOVERY = 1;
    let forcedReplanReason: string | null = null;
    let plannedSteps: TestStep[] = [];
    let plannedIndex = 0;
    let hardReplanCount = 0;
    let softRecoveryCount = 0;
    let previousContextLength = 0;
    let previousContextModalFlag = false;
    let currentMarkedContext = "";
    let previousMarkedContext = "";
    let currentElementMetaMap = new Map<number, { tag: string; raw: string }>();
    let unchangedCycles = 0;
    let lastVisualSignature = "";
    let fillFirstStrategy = this.shouldUseFillFirstStrategy(goal);
    const goalRequiresCriticalCommit = this.goalRequiresCriticalCommit(goal);
    let hasSubmittedCriticalAction = false;
    const runPerfStartMs = this.nowMs();
    const runStartedAt = Date.now();
    const MAX_TELEMETRY_CYCLES = 120;
    const cycleTelemetry: AutopilotCycleTelemetry[] = [];
    const replanReasonCounters = new Map<string, number>();
    let retryCount = 0;
    let domUnchangedCycles = 0;
    let llmPlanCalls = 0;
    let llmPlanMsTotal = 0;
    const PLAN_CHUNK_SIZE = AGENT_MODE === "balanced" ? 4 : 3;
    const PLAN_HISTORY_WINDOW = 10;
    const PREFETCH_TRIGGER_REMAINING = 1;
    let prefetchedPlanPromise: Promise<{
      steps: TestStep[];
      domHash: string;
    }> | null = null;
    let prefetchedPlanDomHash = "";
    const llmCounters: TelemetryLLMCounters = {
      visualCalls: 0,
      visualMs: 0,
      outcomeCalls: 0,
      outcomeMs: 0,
    };
    let observeMsTotal = 0;
    let actMsTotal = 0;
    let verifyMsTotal = 0;
    let maxCycleMs = 0;
    let totalCycleMs = 0;
    let cycleCounter = 0;

    try {
      if (!settings.openRouterApiKey) {
        const missingApiKey =
          "OpenRouter API key is required for Autopilot planning.";
        this.log("error", `❌ ${missingApiKey}`);
        reportGen.addError("console", missingApiKey);
        reportGen.setStatus("FAILED");
        return;
      }

      const requestPlanChunk = async (params: {
        goal: string;
        fillFirstStrategy: boolean;
        hasSubmittedCriticalAction: boolean;
        submitState: SubmitLifecycleState;
        formProgress: { totalControls: number; filledControls: number };
        stepsExecuted: number;
        remainingBudget: number;
        lastOutcome: "unknown" | "progress" | "no_effect" | "error_detected";
        domContext: string;
        previousSteps: TestStep[];
      }): Promise<{ steps: TestStep[]; planMs: number }> => {
        const planningContext = [
          `planner_mode=chunked`,
          `plan_chunk_max=${PLAN_CHUNK_SIZE}`,
          `execution_strategy=${params.fillFirstStrategy && !params.hasSubmittedCriticalAction ? "fill_then_validate" : "balanced"}`,
          `goal_requires_commit=${goalRequiresCriticalCommit ? 1 : 0}`,
          `critical_commit_done=${params.hasSubmittedCriticalAction ? 1 : 0}`,
          `submit_state=${params.submitState}`,
          `form_controls_total=${params.formProgress.totalControls}`,
          `form_controls_filled=${params.formProgress.filledControls}`,
          `steps_executed=${params.stepsExecuted}`,
          `last_outcome=${params.lastOutcome}`,
          `remaining_budget=${params.remainingBudget}`,
        ].join("; ");

        const planningPrompt =
          `${params.fillFirstStrategy ? "[FORM_FILL_FIRST] " : ""}` +
          `[FULL_PLAN][PLAN_CHUNK_MAX=${PLAN_CHUNK_SIZE}] GOAL: ${params.goal}. ` +
          `Return only the next executable chunk (max ${PLAN_CHUNK_SIZE} ordered steps), not the full end-to-end map. ` +
          `Submit lifecycle state: ${params.submitState}. ${this.getPlannerDirectiveForSubmitState(params.submitState)}`;
        const planStart = this.nowMs();
        const rawPlan = await this.llmProvider.generateSteps(
          planningPrompt,
          planningContext,
          params.domContext,
          params.previousSteps.slice(-PLAN_HISTORY_WINDOW),
        );
        const planMs = this.elapsedMs(planStart);
        llmPlanCalls += 1;
        llmPlanMsTotal += planMs;

        if (!rawPlan || rawPlan.length === 0) {
          return { steps: [], planMs };
        }

        return {
          steps: rawPlan.slice(0, PLAN_CHUNK_SIZE),
          planMs,
        };
      };

      while (reportGen.getReport().stepsExecuted < MAX_STEPS) {
        cycleCounter += 1;
        const cycle = cycleCounter;
        const cycleStartedAt = Date.now();
        const cyclePerfStart = this.nowMs();
        let cycleAdaptiveMode: "fast" | "normal" | "complex" = "normal";
        let cycleContextChars = 0;
        let cycleDomUnchanged = false;
        let cycleWaitMs = 0;
        let cycleMarkMs = 0;
        let cycleContextMs = 0;
        let cycleVisualScanMs = 0;
        let cyclePlanMs = 0;
        let cycleActMs = 0;
        let cycleVerifyMs = 0;
        let cycleReplanned = false;
        let cycleReplanReason: string | undefined;
        let cyclePlannedSteps = plannedSteps.length;
        let cyclePlannedIndex = plannedIndex;
        let cycleStepAction: string | undefined;
        let cycleStepTargetId: number | undefined;
        let cycleOutcome: AutopilotCycleTelemetry["outcome"] = "skipped";

        try {
          if (this.shouldStop(reportGen)) {
            cycleOutcome = "stopped";
            break;
          }
          if (fatalRuntimeError) {
            this.log("error", `❌ ${fatalRuntimeError}`);
            reportGen.addError("console", fatalRuntimeError);
            reportGen.setStatus("FAILED");
            cycleOutcome = "failed";
            break;
          }

          if (this.shouldStop(reportGen)) {
            cycleOutcome = "stopped";
            break;
          }

          this.log("thinking", "⏳ Waiting for page stability...");
          const waitStart = this.nowMs();
          await this.domMarker.waitForDOMStability(STABILITY_TIMEOUT);
          cycleWaitMs = this.elapsedMs(waitStart);

          if (this.shouldStop(reportGen)) {
            cycleOutcome = "stopped";
            break;
          }

          cycleAdaptiveMode = this.pickAdaptiveReadMode(
            unchangedCycles,
            reportGen.getReport().stepsExecuted,
          );
          if (
            fillFirstStrategy &&
            !hasSubmittedCriticalAction &&
            cycleAdaptiveMode === "fast"
          ) {
            // Keep IDs and context more stable while still filling the form.
            cycleAdaptiveMode = "normal";
          }
          this.log(
            "thinking",
            `👀 Analyzing page (${cycleAdaptiveMode} adaptive)...`,
          );

          const markStart = this.nowMs();
          await this.domMarker.markInteractiveElements(profileId, cycleAdaptiveMode);
          cycleMarkMs = this.elapsedMs(markStart);

          const contextStart = this.nowMs();
          const markedContext = await this.domMarker.getMarkedContext(profileId);
          cycleContextMs = this.elapsedMs(contextStart);

          currentMarkedContext = this.compactContext(markedContext, previousMarkedContext);
          currentElementMetaMap = this.extractElementMetaMap(markedContext);
          const formProgress = this.getFormProgress(markedContext);
          if (
            formProgress.totalControls >= 4 &&
            reportGen.getReport().stepsExecuted <= 1
          ) {
            fillFirstStrategy = true;
          }
          if (Date.now() > runMemory.expiresAt) {
            forcedCommitStepIds.clear();
            checkboxStateByTargetId.clear();
            checkboxStateTimestampByTargetId.clear();
            lastForcedCommitTargetId = null;
            runMemory.lastCommitTargetId = null;
            runMemory.expiresAt = Date.now() + RUN_MEMORY_TTL_MS;
            this.log(
              "info",
              "🧠 Transient run memory TTL expired. Resetting ephemeral caches.",
            );
          }
          runMemory.lastTouchedAt = Date.now();
          runMemory.expiresAt = runMemory.lastTouchedAt + RUN_MEMORY_TTL_MS;
          const pendingCriticalCommitAction =
            this.hasPendingCriticalCommitAction(currentElementMetaMap);
          const derivedSubmitState = this.deriveSubmitLifecycleState({
            goalRequiresCriticalCommit,
            pendingCriticalCommitAction,
            hasSubmittedCriticalAction,
            fillFirstStrategy,
            formProgress,
          });
          if (derivedSubmitState !== runMemory.submitState) {
            this.log(
              "info",
              `🧭 Submit state: ${runMemory.submitState} -> ${derivedSubmitState}`,
            );
          }
          runMemory.submitState = derivedSubmitState;

          const currentDomHash = this.computeHash(markedContext);
          const isDomUnchanged =
            currentDomHash === this.lastDomHash && this.lastDomHash !== "";
          this.lastDomHash = currentDomHash;
          unchangedCycles = isDomUnchanged ? unchangedCycles + 1 : 0;
          const currentContextLength = markedContext.length;
          const currentModalFlag = this.hasModalSignals(markedContext);
          cycleContextChars = currentContextLength;
          cycleDomUnchanged = isDomUnchanged;

          if (isDomUnchanged) {
            this.log("info", "⚠️ DOM hasn't changed since last step.");
          }

          this.log(
            "info",
            `🔍 Context size: ${markedContext.length} chars ${isDomUnchanged ? "(Unchanged)" : ""}`,
          );

          const previousSteps = reportGen.getReport().steps;
          const plannerHintTargetIds = plannedSteps
            .slice(plannedIndex, plannedIndex + PLAN_CHUNK_SIZE + 1)
            .map((step) => step.targetId || 0)
            .filter((targetId) => targetId > 0);
          const plannerDomContext = this.compactPlannerContext(markedContext, {
            priorityTargetIds: plannerHintTargetIds,
            maxChars:
              fillFirstStrategy && !hasSubmittedCriticalAction ? 2600 : 2200,
          });

          // 2.2 Check for Visual Errors
          const visualStart = this.nowMs();
          const visualErrors = await this.domMarker.detectVisualErrors();
          const visualSignals = await this.domMarker.getVisualSignals();
          cycleVisualScanMs = this.elapsedMs(visualStart);

          const hasVisualFeedback =
            visualErrors.length > 0 || visualSignals.length > 0;
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
              let visualDecision = deterministicVisualDecision;
              if (
                deterministicVisualDecision.verdict === "neutral" &&
                AI_AVAILABLE
              ) {
                const visualClassifyStart = this.nowMs();
                visualDecision = await this.llmProvider.classifyVisualState({
                  goal,
                  signals: visualSignals,
                  previousSteps,
                });
                const visualClassifyMs = this.elapsedMs(visualClassifyStart);
                llmCounters.visualCalls += 1;
                llmCounters.visualMs += visualClassifyMs;
              }

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
                    cycleOutcome = "failed";
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
          const rawReplanReason =
            plannedSteps.length === 0
              ? "empty_plan"
              : plannedIndex >= plannedSteps.length
                ? "plan_exhausted"
                : this.getReplanReason(
                    isDomUnchanged,
                    previousContextLength,
                    currentContextLength,
                    previousContextModalFlag,
                    currentModalFlag,
                    nextPlannedStep,
                    currentElementMetaMap,
                  );
          const replanReason =
            rawReplanReason === "empty_plan" && forcedReplanReason
              ? forcedReplanReason
              : rawReplanReason;
          if (rawReplanReason === "empty_plan" && forcedReplanReason) {
            forcedReplanReason = null;
          }
          const requiresReplan = !!replanReason;

          if (requiresReplan && replanReason) {
            this.incrementCounter(replanReasonCounters, replanReason);

            if (
              this.shouldSuppressReplan(
                replanReason,
                fillFirstStrategy,
                hasSubmittedCriticalAction,
                this.lastOutcome,
              )
            ) {
              cycleReplanReason = `suppressed:${replanReason}`;
              this.log(
                "info",
                `⏭️ Replan suppressed (${replanReason}) to preserve flow continuity.`,
              );
            } else {
              const reasonBudget = this.getReplanBudget(replanReason, AGENT_MODE);
              const reasonAttempts = (replanAttemptsByReason.get(replanReason) || 0) + 1;
              replanAttemptsByReason.set(replanReason, reasonAttempts);
              if (reasonAttempts > reasonBudget) {
                const reason =
                  `Replan budget exceeded for reason "${replanReason}" ` +
                  `(${reasonAttempts - 1}/${reasonBudget}).`;
                this.log("error", `❌ ${reason}`);
                reportGen.addError("console", reason);
                reportGen.setStatus("FAILED");
                cycleOutcome = "failed";
                break;
              }

              let hardReplanRequired = true;
              const severity = this.getReplanSeverity(replanReason);
              if (severity === "soft" && plannedSteps.length > 0) {
                const nextExecutableIndex = this.findNextExecutablePlanIndex(
                  plannedSteps,
                  plannedIndex + 1,
                  currentElementMetaMap,
                );
                if (nextExecutableIndex !== null) {
                  softRecoveryCount++;
                  plannedIndex = nextExecutableIndex;
                  cyclePlannedIndex = plannedIndex;
                  cyclePlannedSteps = plannedSteps.length;
                  cycleReplanned = true;
                  cycleReplanReason = `soft:${replanReason}`;
                  hardReplanRequired = false;
                  this.log(
                    "info",
                    `🩹 Soft recovery applied (${replanReason}). Jumping to planned step ${plannedIndex + 1}/${plannedSteps.length}.`,
                  );
                } else {
                  this.log(
                    "info",
                    `🧱 Soft recovery unavailable for ${replanReason}. Escalating to hard replan.`,
                  );
                }
              }

              if (hardReplanRequired) {
                cycleReplanned = true;
                cycleReplanReason = `hard:${replanReason}`;
                const countsAsHardReplan = replanReason !== "plan_exhausted";
                if (countsAsHardReplan) {
                  hardReplanCount++;
                  if (hardReplanCount > MAX_HARD_REPLANS) {
                    const reason =
                      `Maximum hard replan attempts reached ` +
                      `(${hardReplanCount - 1}/${MAX_HARD_REPLANS}).`;
                    this.log("error", `❌ ${reason}`);
                    reportGen.addError("console", reason);
                    reportGen.setStatus("FAILED");
                    cycleOutcome = "failed";
                    break;
                  }
                }

                if (plannedSteps.length > 0) {
                  if (replanReason === "plan_exhausted") {
                    this.log(
                      "info",
                      "🔁 Current chunk exhausted. Refreshing next plan chunk...",
                    );
                  } else {
                    this.log(
                      "info",
                      `🔄 Hard replanning... (${hardReplanCount}/${MAX_HARD_REPLANS}) reason=${replanReason}`,
                    );
                  }
                } else {
                  this.log("thinking", "🧠 Generating initial execution map...");
                }

                let newPlan: TestStep[] = [];
                if (
                  replanReason === "plan_exhausted" &&
                  prefetchedPlanPromise &&
                  prefetchedPlanDomHash === currentDomHash
                ) {
                  const prefetchWaitStart = this.nowMs();
                  const prefetched: { steps: TestStep[]; domHash: string } =
                    await prefetchedPlanPromise;
                  cyclePlanMs += this.elapsedMs(prefetchWaitStart);
                  prefetchedPlanPromise = null;
                  prefetchedPlanDomHash = "";
                  if (
                    prefetched.steps.length > 0 &&
                    prefetched.domHash === currentDomHash
                  ) {
                    newPlan = prefetched.steps;
                    this.log(
                      "info",
                      `⚡ Prefetched plan chunk reused (${newPlan.length} steps).`,
                    );
                  }
                }

                if (newPlan.length === 0) {
                  const requestedPlan = await requestPlanChunk({
                    goal,
                    fillFirstStrategy,
                    hasSubmittedCriticalAction,
                    submitState: runMemory.submitState,
                    formProgress,
                    stepsExecuted: reportGen.getReport().stepsExecuted,
                    remainingBudget: MAX_STEPS - reportGen.getReport().stepsExecuted,
                    lastOutcome: this.lastOutcome,
                    domContext: plannerDomContext,
                    previousSteps,
                  });
                  cyclePlanMs += requestedPlan.planMs;
                  newPlan = requestedPlan.steps;
                }
                prefetchedPlanPromise = null;
                prefetchedPlanDomHash = "";

                if (!newPlan || newPlan.length === 0) {
                  this.log("error", "AI returned an empty execution map. Stopping.");
                  reportGen.setStatus("FAILED");
                  cycleOutcome = "failed";
                  break;
                }

                plannedSteps = newPlan;
                plannedIndex = 0;
                this.log(
                  "info",
                  `🗺️ Plan ready with ${plannedSteps.length} chunked steps.`,
                );
              }
            }
          }

          const remainingPlannedSteps = plannedSteps.length - plannedIndex;
          if (
            !prefetchedPlanPromise &&
            remainingPlannedSteps > 0 &&
            remainingPlannedSteps <= PREFETCH_TRIGGER_REMAINING &&
            plannedSteps[plannedIndex]?.action !== "FINISH"
          ) {
            const prefetchDomHash: string = currentDomHash;
            prefetchedPlanDomHash = prefetchDomHash;
            this.log(
              "thinking",
              `⚡ Prefetching next plan chunk (max ${PLAN_CHUNK_SIZE} steps)...`,
            );
            prefetchedPlanPromise = requestPlanChunk({
              goal,
              fillFirstStrategy,
              hasSubmittedCriticalAction,
              submitState: runMemory.submitState,
              formProgress,
              stepsExecuted: reportGen.getReport().stepsExecuted,
              remainingBudget: MAX_STEPS - reportGen.getReport().stepsExecuted,
              lastOutcome: this.lastOutcome,
              domContext: plannerDomContext,
              previousSteps,
            })
              .then((result) => ({
                steps: result.steps,
                domHash: prefetchDomHash,
              }))
              .catch((error) => {
                const message =
                  error instanceof Error ? error.message : String(error);
                this.log(
                  "info",
                  `⚠️ Plan prefetch skipped: ${message.slice(0, 180)}`,
                );
                return { steps: [], domHash: prefetchDomHash };
              });
          }

          const nextStep = plannedSteps[plannedIndex];
          plannedIndex++;
          cyclePlannedSteps = plannedSteps.length;
          cyclePlannedIndex = plannedIndex;
          cycleStepAction = nextStep?.action;
          cycleStepTargetId = nextStep?.targetId;
          this.log("thinking", "🧠 Executing mapped step...");

          if (nextStep?.thought) {
            this.log("thinking", `💭 Thought: ${nextStep.thought}`);
          }

          if (nextStep.action === "FINISH") {
            const mustCommitBeforeFinish =
              (goalRequiresCriticalCommit || pendingCriticalCommitAction) &&
              !hasSubmittedCriticalAction;
            if (
              mustCommitBeforeFinish &&
              runMemory.submitState === "filling"
            ) {
              this.incrementCounter(
                replanReasonCounters,
                "finish_before_form_complete",
              );
              cycleReplanned = true;
              cycleReplanReason = "hard:finish_before_form_complete";
              cycleOutcome = "retry";
              plannedSteps = [];
              plannedIndex = 0;
              forcedReplanReason = "finish_before_form_complete";
              this.lastOutcome = "no_effect";
              this.log(
                "info",
                "🧭 FINISH blocked: form still in filling state before required commit. Regenerating plan.",
              );
              continue;
            }

            if (
              mustCommitBeforeFinish &&
              (runMemory.submitState === "ready_to_commit" ||
                runMemory.submitState === "commit_in_flight")
            ) {
              const fallbackCommitTargetId =
                this.findCriticalCommitTargetId(currentElementMetaMap);
              if (fallbackCommitTargetId) {
                if (fallbackCommitTargetId === lastForcedCommitTargetId) {
                  this.incrementCounter(
                    replanReasonCounters,
                    "finish_fallback_duplicate_target",
                  );
                  cycleReplanned = true;
                  cycleReplanReason = "hard:finish_without_commit";
                  cycleOutcome = "retry";
                  plannedSteps = [];
                  plannedIndex = 0;
                  forcedReplanReason = "finish_without_commit";
                  this.lastOutcome = "no_effect";
                  this.log(
                    "info",
                    `🧷 FINISH fallback target repeated (ID [${fallbackCommitTargetId}]). Regenerating plan instead of reinjecting duplicate click.`,
                  );
                  continue;
                }
                const fallbackCommitStep: TestStep = {
                  id: crypto.randomUUID(),
                  action: "CLICK",
                  selector: "body",
                  targetId: fallbackCommitTargetId,
                  delay: 500,
                  order: nextStep.order,
                  thought: "Fallback commit click before final verification.",
                };
                forcedCommitStepIds.add(fallbackCommitStep.id);
                lastForcedCommitTargetId = fallbackCommitTargetId;
                runMemory.lastCommitTargetId = fallbackCommitTargetId;
                const syntheticFinishStep: TestStep = {
                  ...nextStep,
                  id: crypto.randomUUID(),
                  order: (nextStep.order || 0) + 1,
                  thought: "Finish after fallback commit click.",
                };
                plannedIndex = Math.max(plannedIndex - 1, 0);
                plannedSteps.splice(
                  plannedIndex,
                  1,
                  fallbackCommitStep,
                  syntheticFinishStep,
                );
                cycleReplanned = true;
                cycleReplanReason = "soft:inject_commit_step";
                cycleOutcome = "retry";
                this.log(
                  "info",
                  `🧷 FINISH intercepted. Injecting fallback commit click on ID [${fallbackCommitTargetId}] before final verification.`,
                );
                continue;
              }
              this.incrementCounter(replanReasonCounters, "finish_without_commit");
              cycleReplanned = true;
              cycleReplanReason = "hard:finish_without_commit";
              cycleOutcome = "retry";
              plannedSteps = [];
              plannedIndex = 0;
              forcedReplanReason = "finish_without_commit";
              this.lastOutcome = "no_effect";
              this.log(
                "info",
                "🧭 FINISH blocked: goal still requires submit/commit action. Regenerating plan.",
              );
              continue;
            }
          }

          if (nextStep.action === "FINISH") {
            const verifyStart = this.nowMs();
            const verification = await this.verifyFinalOutcome({
              goal,
              profileId,
              beforeContext: currentMarkedContext,
              visualErrors,
              executedSteps: previousSteps,
              allowAI: AI_AVAILABLE,
              telemetryCounters: llmCounters,
            });
            cycleVerifyMs = this.elapsedMs(verifyStart);
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
              runMemory.submitState = "verified";
              reportGen.setStatus("COMPLETED");
            }
            cycleOutcome = "finish";
            break;
          }

          if (
            hasSubmittedCriticalAction &&
            nextStep.action === "CLICK" &&
            this.isCriticalCommitAction(nextStep, currentElementMetaMap) &&
            nextStep.targetId &&
            runMemory.lastCommitTargetId === nextStep.targetId
          ) {
            this.incrementCounter(replanReasonCounters, "duplicate_commit_click");
            cycleReplanned = true;
            cycleReplanReason = "soft:duplicate_commit_click";
            cycleOutcome = "retry";
            this.log(
              "info",
              `🧷 Duplicate commit click suppressed on ID [${nextStep.targetId}] after successful commit.`,
            );
            continue;
          }

          // Loop detection
          if (this.detectLoop(previousSteps, nextStep)) {
            this.log(
              "info",
              `⚠️ Detected recursive loop. Stopping to avoid infinite execution.`,
            );
            reportGen.setStatus("FAILED"); // Or completed? Failed seems safer for loops.
            cycleOutcome = "failed";
            break;
          }

          const preconditionError = this.validateStepPreconditions(
            nextStep,
            currentElementMetaMap,
          );
          if (preconditionError) {
            const preconditionStepKey = this.getStepKey(nextStep);
            const preconditionRecoveryAttempts =
              preconditionRecoveryByStepKey.get(preconditionStepKey) || 0;
            if (
              this.isRecoverablePreconditionError(preconditionError) &&
              preconditionRecoveryAttempts < MAX_PRECONDITION_RECOVERY
            ) {
              preconditionRecoveryByStepKey.set(
                preconditionStepKey,
                preconditionRecoveryAttempts + 1,
              );
              this.incrementCounter(
                replanReasonCounters,
                "precondition_mismatch",
              );
              cycleReplanned = true;
              cycleReplanReason = "hard:precondition_mismatch";
              cycleOutcome = "retry";
              plannedSteps = [];
              plannedIndex = 0;
              this.log(
                "info",
                `🛠️ Recoverable precondition mismatch detected (${preconditionError}). Forcing plan regeneration.`,
              );
              continue;
            }
            this.log("error", `❌ Invalid generated step: ${preconditionError}`);
            reportGen.addError("console", preconditionError);
            reportGen.setStatus("FAILED");
            stepResults.push({
              stepId: nextStep.id,
              status: "error",
              timestamp: Date.now(),
              message: preconditionError,
            });
            cycleOutcome = "failed";
            break;
          }

          this.resolveStepData(nextStep, currentElementMetaMap);

          if (
            (nextStep.action === "CHECK" || nextStep.action === "UNCHECK") &&
            nextStep.targetId
          ) {
            const desiredChecked = nextStep.action === "CHECK";
            const observedState = this.getCheckboxStateFromMeta(
              currentElementMetaMap.get(nextStep.targetId),
            );
            if (observedState !== null) {
              checkboxStateByTargetId.set(nextStep.targetId, observedState);
            }
            const knownState = checkboxStateByTargetId.get(nextStep.targetId);
            const lastStateTs =
              checkboxStateTimestampByTargetId.get(nextStep.targetId) || 0;
            const withinAntiFlipWindow =
              Date.now() - lastStateTs <= CHECKBOX_ANTI_FLIP_WINDOW_MS;

            if (knownState === desiredChecked) {
              this.log(
                "info",
                `🧩 Anti-flip: skipping redundant ${nextStep.action} on ID [${nextStep.targetId}] (state already ${desiredChecked ? "checked" : "unchecked"}).`,
              );
              cycleReplanned = true;
              cycleReplanReason = "soft:checkbox_anti_flip";
              cycleOutcome = "retry";
              continue;
            }

            if (
              knownState !== undefined &&
              knownState !== desiredChecked &&
              withinAntiFlipWindow
            ) {
              this.log(
                "info",
                `🧩 Anti-flip: blocked contradictory ${nextStep.action} on ID [${nextStep.targetId}] within ${CHECKBOX_ANTI_FLIP_WINDOW_MS}ms window.`,
              );
              cycleReplanned = true;
              cycleReplanReason = "soft:checkbox_anti_flip";
              cycleOutcome = "retry";
              continue;
            }
          }

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
              cycleOutcome = "failed";
              break;
            }

            retryByStepKey.set(currentStepKey, retriesUsed + 1);
            retryCount += 1;
            this.log(
              "info",
              `🔁 Reintento no crítico ${retriesUsed + 1}/${MAX_RETRIES_NON_CRITICAL} para ${nextStep.action} [${nextStep.targetId}]`,
            );
            plannedIndex = Math.max(plannedIndex - 1, 0);
            previousContextLength = currentContextLength;
            previousContextModalFlag = currentModalFlag;
            previousMarkedContext = markedContext;
            cycleOutcome = "retry";
            continue;
          } else {
            retryByStepKey.set(currentStepKey, 0);
          }

          // 4. Act
          if (this.shouldStop(reportGen)) {
            cycleOutcome = "stopped";
            break;
          }

          try {
            lastExecutedWasCriticalCommit =
              forcedCommitStepIds.has(nextStep.id) ||
              this.isCriticalCommitAction(nextStep, currentElementMetaMap);
            if (lastExecutedWasCriticalCommit) {
              runMemory.submitState = "commit_in_flight";
              if (nextStep.targetId) {
                runMemory.lastCommitTargetId = nextStep.targetId;
              }
            }
            const actStart = this.nowMs();
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
            cycleActMs = this.elapsedMs(actStart);

            reportGen.addStep(nextStep);
            if (lastExecutedWasCriticalCommit) {
              hasSubmittedCriticalAction = true;
              runMemory.submitState = "committed";
            }
            if (
              (nextStep.action === "CHECK" || nextStep.action === "UNCHECK") &&
              nextStep.targetId
            ) {
              checkboxStateByTargetId.set(
                nextStep.targetId,
                nextStep.action === "CHECK",
              );
              checkboxStateTimestampByTargetId.set(nextStep.targetId, Date.now());
            }
            stepResults.push({
              stepId: nextStep.id,
              status: "success",
              timestamp: Date.now(),
              message: "Step executed",
            });
            this.log("success", "✅ Step executed.");
            cycleOutcome = "executed";
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
            cycleOutcome = "failed";
            break;
          }

          previousContextLength = currentContextLength;
          previousContextModalFlag = currentModalFlag;
          previousMarkedContext = markedContext;
        } finally {
          const observeMs =
            cycleWaitMs + cycleMarkMs + cycleContextMs + cycleVisualScanMs;
          observeMsTotal += observeMs;
          actMsTotal += cycleActMs;
          verifyMsTotal += cycleVerifyMs;
          if (cycleDomUnchanged) {
            domUnchangedCycles += 1;
          }
          const cycleDurationMs = this.elapsedMs(cyclePerfStart);
          totalCycleMs += cycleDurationMs;
          if (cycleDurationMs > maxCycleMs) {
            maxCycleMs = cycleDurationMs;
          }

          if (cycleTelemetry.length < MAX_TELEMETRY_CYCLES) {
            cycleTelemetry.push({
              cycle,
              startedAt: cycleStartedAt,
              durationMs: cycleDurationMs,
              adaptiveMode: cycleAdaptiveMode,
              contextChars: cycleContextChars,
              domUnchanged: cycleDomUnchanged,
              unchangedCycles,
              waitMs: cycleWaitMs,
              markMs: cycleMarkMs,
              contextMs: cycleContextMs,
              visualScanMs: cycleVisualScanMs,
              planMs: cyclePlanMs,
              actMs: cycleActMs,
              verifyMs: cycleVerifyMs,
              replanned: cycleReplanned,
              replanReason: cycleReplanReason,
              plannedSteps: cyclePlannedSteps,
              plannedIndex: cyclePlannedIndex,
              stepAction: cycleStepAction,
              stepTargetId: cycleStepTargetId,
              outcome: cycleOutcome,
            });
          }

          if (
            cycleReplanned ||
            cycleOutcome === "failed" ||
            cycleDurationMs > 1800
          ) {
            this.log(
              "info",
              `📈 Cycle ${cycle}: total=${cycleDurationMs}ms observe=${observeMs}ms plan=${cyclePlanMs}ms act=${cycleActMs}ms`,
            );
          }
        }
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
      forcedCommitStepIds.clear();
      checkboxStateByTargetId.clear();
      checkboxStateTimestampByTargetId.clear();
      lastForcedCommitTargetId = null;
      runMemory.lastCommitTargetId = null;
      runMemory.submitState = "verified";
      runMemory.expiresAt = 0;
      runMemory.lastTouchedAt = Date.now();

      const finalReport = reportGen.finalize();
      const runEndedAt = Date.now();
      const runDurationMs = this.elapsedMs(runPerfStartMs);
      const avgCycleMs =
        cycleCounter > 0
          ? this.roundMs(totalCycleMs / cycleCounter)
          : 0;
      const telemetry: AutopilotTelemetry = {
        summary: {
          schemaVersion: 1,
          runStartedAt,
          runEndedAt,
          durationMs: runDurationMs,
          cycles: cycleCounter,
          stepsExecuted: finalReport.stepsExecuted,
          replans: hardReplanCount,
          retries: retryCount,
          domUnchangedCycles,
          llmPlanCalls,
          llmPlanMsTotal: this.roundMs(llmPlanMsTotal),
          llmVisualCalls: llmCounters.visualCalls,
          llmVisualMsTotal: this.roundMs(llmCounters.visualMs),
          llmOutcomeCalls: llmCounters.outcomeCalls,
          llmOutcomeMsTotal: this.roundMs(llmCounters.outcomeMs),
          observeMsTotal: this.roundMs(observeMsTotal),
          actMsTotal: this.roundMs(actMsTotal),
          verifyMsTotal: this.roundMs(verifyMsTotal),
          avgCycleMs,
          maxCycleMs: this.roundMs(maxCycleMs),
          replanReasons: Object.fromEntries(replanReasonCounters.entries()),
        },
        cycles: cycleTelemetry,
      };

      this.log(
        "info",
        `📈 Perf summary: cycles=${telemetry.summary.cycles}, hardReplans=${telemetry.summary.replans}, softRecoveries=${softRecoveryCount}, retries=${telemetry.summary.retries}, avgCycle=${telemetry.summary.avgCycleMs}ms`,
      );
      this.log("info", `📊 Report generated. Status: ${finalReport.status}`);

      // Save to History
      await this.saveHistory(
        finalReport,
        stepResults,
        capturedConsoleLogs,
        telemetry,
      );
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

  private compactPlannerContext(
    markedContext: string,
    options: {
      priorityTargetIds: number[];
      maxChars: number;
    },
  ): string {
    const lines = markedContext.split("\n").filter((line) => line.trim().length > 0);
    if (lines.length === 0) return "";
    const selected: string[] = [];
    const seen = new Set<string>();
    const priorityIds = new Set(
      options.priorityTargetIds.filter((targetId) => targetId > 0),
    );
    const pushLine = (line: string) => {
      const trimmed = line.trim();
      if (!trimmed || seen.has(trimmed)) return;
      seen.add(trimmed);
      selected.push(trimmed);
    };
    const extractId = (line: string): number | null => {
      const match = line.match(/^\[(\d+)\]/);
      if (!match) return null;
      const parsed = Number(match[1]);
      return Number.isFinite(parsed) ? parsed : null;
    };

    for (const line of lines) {
      const id = extractId(line);
      if (id !== null && priorityIds.has(id)) {
        pushLine(line);
      }
    }

    const controlRegex =
      /<input|<select|<textarea|checkbox|radio|type=|placeholder=|name=/i;
    const commitRegex =
      /(submit|enviar|save|guardar|create|crear|register|signup|sign up|finish|finalizar|confirm|checkout|terms|privacy)/i;
    const feedbackRegex =
      /(error|invalid|required|warning|alert|success|completed|failed)/i;

    for (const line of lines) {
      if (
        controlRegex.test(line) ||
        commitRegex.test(line) ||
        feedbackRegex.test(line)
      ) {
        pushLine(line);
      }
    }

    const MIN_BASELINE_LINES = 24;
    for (const line of lines) {
      if (selected.length >= MIN_BASELINE_LINES) break;
      pushLine(line);
    }

    const compacted = selected.join("\n");
    return compacted.length > options.maxChars
      ? compacted.slice(0, options.maxChars) + "\n...[planner context truncated]"
      : compacted;
  }

  private shouldUseFillFirstStrategy(goal: string): boolean {
    return /(form|formulario|registro|register|signup|sign up|create user|crear usuario|fill|llenar)/i.test(
      goal,
    );
  }

  private goalRequiresCriticalCommit(goal: string): boolean {
    return (
      /(submit|enviar|save|guardar|register|signup|sign up|checkout|confirm|finish|finalizar)/i.test(
        goal,
      ) ||
      /create\s+(an?\s+)?account/i.test(goal) ||
      /crear\s+(la\s+)?cuenta/i.test(goal) ||
      /(bot[oó]n|btn|button).*(crear|create|submit|guardar|save)/i.test(goal)
    );
  }

  private deriveSubmitLifecycleState(params: {
    goalRequiresCriticalCommit: boolean;
    pendingCriticalCommitAction: boolean;
    hasSubmittedCriticalAction: boolean;
    fillFirstStrategy: boolean;
    formProgress: { totalControls: number; filledControls: number };
  }): SubmitLifecycleState {
    if (params.hasSubmittedCriticalAction) return "committed";

    const requiresCommit =
      params.goalRequiresCriticalCommit || params.pendingCriticalCommitAction;
    if (!requiresCommit) return "ready_to_commit";

    const hasMeaningfulForm =
      params.formProgress.totalControls >= 4 || params.fillFirstStrategy;
    const hasPendingFormFill =
      hasMeaningfulForm &&
      params.formProgress.filledControls < params.formProgress.totalControls;

    if (hasPendingFormFill) return "filling";
    return "ready_to_commit";
  }

  private getPlannerDirectiveForSubmitState(
    submitState: SubmitLifecycleState,
  ): string {
    if (submitState === "filling") {
      return "Do not FINISH. Avoid submit/create/save clicks until essential form fields are completed.";
    }
    if (submitState === "ready_to_commit") {
      return "Prioritize exactly one commit action (submit/create/save), then stop mutating fields.";
    }
    if (submitState === "commit_in_flight") {
      return "Avoid repeated commit clicks; wait for feedback and prepare FINISH.";
    }
    if (submitState === "committed") {
      return "Prefer FINISH unless explicit error signals require corrective action.";
    }
    return "Return FINISH if no blocking errors are visible.";
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
    telemetryCounters?: TelemetryLLMCounters;
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
    let visualDecision: {
      verdict: "error" | "success" | "warning" | "neutral";
      confidence: number;
      rationale: string;
    } = { verdict: "neutral", confidence: 0.5, rationale: "No visual signals." };
    if (visualSignals.length) {
      const visualClassifyStart = this.nowMs();
      visualDecision = await this.llmProvider.classifyVisualState({
        goal: params.goal,
        signals: visualSignals,
        previousSteps: params.executedSteps,
      });
      const visualClassifyMs = this.elapsedMs(visualClassifyStart);
      if (params.telemetryCounters) {
        params.telemetryCounters.visualCalls += 1;
        params.telemetryCounters.visualMs += visualClassifyMs;
      }
    }

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

    const outcomeStart = this.nowMs();
    const outcome = await this.llmProvider.evaluateOutcome({
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
    const outcomeMs = this.elapsedMs(outcomeStart);
    if (params.telemetryCounters) {
      params.telemetryCounters.outcomeCalls += 1;
      params.telemetryCounters.outcomeMs += outcomeMs;
    }
    return outcome;
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

  private isRecoverablePreconditionError(error: string): boolean {
    return (
      /non-text element/i.test(error) ||
      /non-select element/i.test(error) ||
      /missing valid targetid/i.test(error) ||
      /select action missing value/i.test(error)
    );
  }

  private getCheckboxStateFromMeta(
    elementMeta: { tag: string; raw: string } | undefined,
  ): boolean | null {
    if (!elementMeta) return null;
    const raw = elementMeta.raw || "";
    if (/aria-checked="true"/i.test(raw)) return true;
    if (/aria-checked="false"/i.test(raw)) return false;
    if (/\bchecked\b/i.test(raw)) return true;
    if (/\bunchecked\b/i.test(raw)) return false;
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

  private hasPendingCriticalCommitAction(
    elementMetaMap: Map<number, { tag: string; raw: string }>,
  ): boolean {
    for (const meta of elementMetaMap.values()) {
      const tag = meta.tag.toLowerCase();
      if (tag !== "button" && tag !== "input" && tag !== "a") continue;
      if (
        /(submit|save|guardar|continuar|continue|enviar|finish|finalizar|create account|crear cuenta|create|crear|checkout|confirm)/i.test(
          meta.raw,
        )
      ) {
        return true;
      }
    }
    return false;
  }

  private findCriticalCommitTargetId(
    elementMetaMap: Map<number, { tag: string; raw: string }>,
  ): number | null {
    const strongPattern =
      /(create account|crear cuenta|submit|enviar|save|guardar|finish|finalizar|checkout|confirm)/i;
    const weakPattern = /(create|crear|continue|continuar|register|signup|sign up)/i;

    for (const [id, meta] of elementMetaMap.entries()) {
      const tag = meta.tag.toLowerCase();
      if (tag !== "button" && tag !== "input" && tag !== "a") continue;
      if (strongPattern.test(meta.raw)) return id;
    }

    for (const [id, meta] of elementMetaMap.entries()) {
      const tag = meta.tag.toLowerCase();
      if (tag !== "button" && tag !== "input" && tag !== "a") continue;
      if (weakPattern.test(meta.raw)) return id;
    }

    return null;
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

  private getReplanReason(
    isDomUnchanged: boolean,
    previousContextLength: number,
    currentContextLength: number,
    previousContextModalFlag: boolean,
    currentContextModalFlag: boolean,
    nextPlannedStep: TestStep | undefined,
    currentElementMetaMap: Map<number, { tag: string; raw: string }>,
  ): string | null {
    if (!nextPlannedStep) return "missing_next_step";

    if (
      nextPlannedStep.targetId &&
      !currentElementMetaMap.has(nextPlannedStep.targetId)
    ) {
      return "target_not_in_dom";
    }

    if (previousContextLength <= 0) return null;

    const lengthDeltaRatio =
      Math.abs(currentContextLength - previousContextLength) /
      Math.max(previousContextLength, 1);

    if (!isDomUnchanged && lengthDeltaRatio > 0.28) {
      return "context_delta_ratio";
    }

    if (previousContextModalFlag !== currentContextModalFlag) {
      return "modal_state_changed";
    }

    return null;
  }

  private shouldSuppressReplan(
    reason: string,
    fillFirstStrategy: boolean,
    hasSubmittedCriticalAction: boolean,
    lastOutcome: "unknown" | "progress" | "no_effect" | "error_detected",
  ): boolean {
    if (reason !== "context_delta_ratio") return false;
    if (fillFirstStrategy && !hasSubmittedCriticalAction) return true;
    if (lastOutcome === "progress") return true;
    return false;
  }

  private getReplanSeverity(reason: string): "soft" | "hard" {
    if (reason === "target_not_in_dom" || reason === "context_delta_ratio") {
      return "soft";
    }
    return "hard";
  }

  private getReplanBudget(
    reason: string,
    mode: "strict_fail_fast" | "balanced",
  ): number {
    const strictBudget: Record<string, number> = {
      empty_plan: 1,
      plan_exhausted: 14,
      missing_next_step: 2,
      target_not_in_dom: 6,
      context_delta_ratio: 8,
      modal_state_changed: 2,
      finish_without_commit: 3,
      finish_before_form_complete: 3,
      precondition_mismatch: 3,
    };
    const balancedBudget: Record<string, number> = {
      empty_plan: 2,
      plan_exhausted: 20,
      missing_next_step: 4,
      target_not_in_dom: 10,
      context_delta_ratio: 12,
      modal_state_changed: 4,
      finish_without_commit: 5,
      finish_before_form_complete: 5,
      precondition_mismatch: 5,
    };
    const table = mode === "balanced" ? balancedBudget : strictBudget;
    return table[reason] ?? (mode === "balanced" ? 5 : 3);
  }

  private findNextExecutablePlanIndex(
    steps: TestStep[],
    startIndex: number,
    currentElementMetaMap: Map<number, { tag: string; raw: string }>,
  ): number | null {
    const safeStart = Math.max(0, startIndex);
    for (let i = safeStart; i < steps.length; i++) {
      const step = steps[i];
      if (step.action === "FINISH") return i;
      if (step.targetId && currentElementMetaMap.has(step.targetId)) return i;
    }
    return null;
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
    telemetry?: AutopilotTelemetry,
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
        autopilotTelemetry: telemetry,
      };

      const { storageService } = await import("../../commons/lib/storage");
      await storageService.addToHistory(historyEntry);
      this.log("success", "💾 Run saved to History.");
    } catch (err) {
      this.log("error", "Failed to save history: " + err);
    }
  }
}
