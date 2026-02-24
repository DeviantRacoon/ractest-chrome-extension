/**
 * Execution Service
 * Panel-side service that manages communication with the content script
 * for recipe execution. Handles sending commands and receiving results.
 */

import { roles } from "aria-query";
import type {
  CapturedErrorSubtype,
  FailureSignal,
  StepExecutionResult,
  TestProfile,
  TestStep,
} from "../types";
import type { ContentToPopupMessage } from "../types/messages";

type StepResultCallback = (result: StepExecutionResult) => void;
type ExecutionCompleteCallback = (results: StepExecutionResult[]) => void;
type ExecutionFailedCallback = (
  error: string,
  results: StepExecutionResult[],
) => void;

type AutomationFeedbackItem = {
  text: string;
  className: string;
  role: string;
  ariaLive: string;
  color: string;
  backgroundColor: string;
  borderColor: string;
  accessibleName?: string;
  accessibleDescription?: string;
  labelText?: string;
};

type AutomationFeedbackSnapshot = {
  url: string;
  title: string;
  feedbackItems: AutomationFeedbackItem[];
  invalidFields: string[];
};

type TemporalEvidenceWindow = {
  startedAt: number;
  endedAt: number;
  samples: number;
  snapshots: AutomationFeedbackSnapshot[];
};

type DeterministicOutcome = {
  verdict: "success" | "failure" | "inconclusive";
  rationale: string;
  score: number;
  signals: string[];
};

export class ExecutionService {
  private onStepResultCallback: StepResultCallback | null = null;
  private onCompleteCallback: ExecutionCompleteCallback | null = null;
  private onFailedCallback: ExecutionFailedCallback | null = null;
  private currentTabId: number | null = null;
  private executionLogs: import("../types").ConsoleLogEntry[] = [];
  private isExecuting = false;
  private executionStartTime = 0;
  private pendingFailureSignals: FailureSignal[] = [];

  private static readonly FAILURE_KEYWORDS =
    /(failed|error|invalid|required|unable|degraded|rechazad|fall[óo]|inv[aá]lid|obligatorio)/i;
  private static readonly SUCCESS_KEYWORDS =
    /(success|successful|created|saved|completed|welcome|exito|correctamente|completado)/i;

  constructor() {
    // Listen for messages from content script
    if (typeof chrome !== "undefined" && chrome.runtime) {
      chrome.runtime.onMessage.addListener(
        (
          message: ContentToPopupMessage,
          sender: chrome.runtime.MessageSender,
        ) => {
          const senderTabId = sender.tab?.id;
          switch (message.type) {
            case "STEP_RESULT":
              this.onStepResultCallback?.(message.result);
              break;

            case "EXECUTION_COMPLETE":
              console.log("[ExecutionService] EXECUTION_COMPLETE (UI)");
              this.onCompleteCallback?.(message.results);
              break;

            case "EXECUTION_FAILED":
              console.log("[ExecutionService] EXECUTION_FAILED (UI)");
              this.onFailedCallback?.(message.error, message.results);
              break;

            case "CONSOLE_LOG":
              this.executionLogs.push(message.logEntry);
              break;

            case "CAPTURED_ERROR": {
              if (
                !this.isExecuting ||
                !this.currentTabId ||
                senderTabId !== this.currentTabId
              ) {
                break;
              }

              const subtype = this.normalizeSubtype(message.subtype);
              if (!subtype) break;

              const signal: FailureSignal = {
                subtype,
                message: this.formatSignalMessage(subtype, message.payload),
                timestamp: message.timestamp || Date.now(),
                payload: message.payload,
              };
              if (
                subtype === "CONSOLE" &&
                message.payload &&
                typeof message.payload === "object"
              ) {
                const payload = message.payload as {
                  timestamp?: number;
                  level?: string;
                  message?: string;
                  stack?: string;
                };
                const level = String(payload.level || "log").toLowerCase();
                const mappedLevel: import("../types").ConsoleLogEntry["level"] =
                  level === "error" ||
                  level === "warn" ||
                  level === "info" ||
                  level === "debug" ||
                  level === "log"
                    ? level
                    : "log";
                this.executionLogs.push({
                  timestamp: Number(payload.timestamp || signal.timestamp),
                  level: mappedLevel,
                  message: String(payload.message || signal.message),
                  stack: payload.stack,
                });
              } else {
                this.executionLogs.push({
                  timestamp: signal.timestamp,
                  level: "error",
                  message: `[${signal.subtype}] ${signal.message}`,
                });
              }

              if (this.isHardFailureSignal(signal)) {
                this.pendingFailureSignals.push(signal);
              }
              break;
            }
          }
        },
      );
    }
  }

  /**
   * Execute a recipe on the current tab.
   * 1. Opens the recipe URL if needed
   * 2. Waits for page load
   * 3. Injects content script
   * 4. Sends EXECUTE_RECIPE
   */
  /**
   * Execute a recipe on the current tab with persistence support.
   */
  public async executeRecipe(
    recipe: TestProfile,
    startFromIndex = 0,
  ): Promise<void> {
    if (typeof chrome === "undefined" || !chrome.tabs) {
      console.warn("[ExecutionService] Not running as Chrome extension");
      return;
    }

    // Get current active tab
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });

    if (!tab.id) {
      throw new Error("No active tab found");
    }

    this.currentTabId = tab.id;
    this.isExecuting = true;
    this.executionStartTime = Date.now();
    this.pendingFailureSignals = [];

    const currentUrl = tab.url || "";
    const targetUrl = recipe.url;

    // Navigate to URL if different (initial setup)
    if (!currentUrl.startsWith(targetUrl)) {
      await chrome.tabs.update(tab.id, { url: targetUrl });
      await this.waitForPageLoad(tab.id);
    }

    // Slice steps to honour startFromIndex
    const stepsToRun = recipe.steps.slice(startFromIndex);

    // Execute steps one by one
    const results: StepExecutionResult[] = [];
    this.executionLogs = []; // Reset logs

    try {
      // Execute steps one by one
      for (const step of stepsToRun) {
        // Check for cancellation
        if (!this.currentTabId) {
          const result: StepExecutionResult = {
            stepId: step.id,
            status: "skipped",
            message: "Ejecución cancelada",
            timestamp: Date.now(),
          };
          results.push(result);
          break; // Stop loop
        }

        try {
          // Ensure content script is ready (crucial after navigation)
          await this.ensureContentScript(this.currentTabId);
          const stepBaselineSnapshot =
            await this.prepareReactiveObservationOnContent(this.currentTabId);

          // Execute step
          this.pendingFailureSignals = [];
          const result = await this.executeStepOnContent(
            this.currentTabId,
            step,
          );
          results.push(result);
          this.onStepResultCallback?.(result);

          if (result.status === "error") {
            // Save history on error
            await this.saveHistory(recipe, "failed", results, result.message);
            this.onFailedCallback?.(result.message || "Error en paso", results);
            this.resetExecutionState();
            return;
          }

          // Observe hard-failure signals in a short reactive window after each step.
          const reactiveWindowMs = Math.min(Math.max(step.delay, 600), 3000);
          const hardFailureSignal =
            await this.waitForHardFailureSignal(reactiveWindowMs);

          if (hardFailureSignal) {
            const errorMessage = `Fallo detectado automáticamente (${hardFailureSignal.subtype}): ${hardFailureSignal.message}`;
            const failureStepResult: StepExecutionResult = {
              stepId: step.id,
              status: "error",
              message: errorMessage,
              error: errorMessage,
              timestamp: Date.now(),
            };
            results.push(failureStepResult);
            this.onStepResultCallback?.(failureStepResult);
            await this.saveHistory(
              recipe,
              "failed",
              results,
              errorMessage,
              hardFailureSignal,
            );
            this.onFailedCallback?.(errorMessage, results);
            this.sendNotification(
              "Error en el flujo",
              `Se detectó una falla automática: ${hardFailureSignal.subtype}`,
            );
            this.resetExecutionState();
            return;
          }

          const domFailureSignal = await this.checkReactiveFailureOnContent(
            this.currentTabId,
            step.action,
            result.message,
            stepBaselineSnapshot,
          );

          if (domFailureSignal) {
            const errorMessage = `Fallo detectado automáticamente (${domFailureSignal.subtype}): ${domFailureSignal.message}`;
            const failureStepResult: StepExecutionResult = {
              stepId: step.id,
              status: "error",
              message: errorMessage,
              error: errorMessage,
              timestamp: Date.now(),
            };
            results.push(failureStepResult);
            this.onStepResultCallback?.(failureStepResult);
            await this.saveHistory(
              recipe,
              "failed",
              results,
              errorMessage,
              domFailureSignal,
            );
            this.onFailedCallback?.(errorMessage, results);
            this.sendNotification(
              "Error en el flujo",
              "Se detectó un error visible de validación en la página.",
            );
            this.resetExecutionState();
            return;
          }

          if (
            this.currentTabId &&
            this.isCriticalCommitStep(step, result.message)
          ) {
            const submitWindow = await this.collectTemporalEvidenceWindow(
              this.currentTabId,
              4500,
              300,
            );
            const deterministicAfterSubmit =
              this.evaluateDeterministicOutcomeFromWindow(submitWindow);
            if (deterministicAfterSubmit.verdict === "failure") {
              const errorMessage = `Fallo detectado automáticamente (DETERMINISTIC_POST_SUBMIT): ${deterministicAfterSubmit.rationale}`;
              const failureStepResult: StepExecutionResult = {
                stepId: step.id,
                status: "error",
                message: errorMessage,
                error: errorMessage,
                timestamp: Date.now(),
              };
              results.push(failureStepResult);
              this.onStepResultCallback?.(failureStepResult);
              await this.saveHistory(recipe, "failed", results, errorMessage, {
                subtype: "FORM_VALIDATION",
                message: deterministicAfterSubmit.rationale,
                timestamp: Date.now(),
                payload: {
                  score: deterministicAfterSubmit.score,
                  signals: deterministicAfterSubmit.signals,
                  samples: submitWindow.samples,
                },
              });
              this.onFailedCallback?.(errorMessage, results);
              this.sendNotification(
                "Error en el flujo",
                "Se detectó fallo visible tras el submit.",
              );
              this.resetExecutionState();
              return;
            }
          }

          if (step.delay > reactiveWindowMs) {
            await this.wait(step.delay - reactiveWindowMs);
          }
        } catch (error) {
          // Handle unexpected errors (e.g. tab closed)
          const errorMessage =
            error instanceof Error ? error.message : String(error);

          // Save history on unexpected error
          await this.saveHistory(recipe, "failed", results, errorMessage);
          this.onFailedCallback?.(errorMessage, results);
          this.resetExecutionState();
          return;
        }
      }

      // Check if it was cancelled
      if (!this.currentTabId) {
        await this.saveHistory(recipe, "cancelled", results);
        this.resetExecutionState();
        // trigger failed callback with cancelled message or just do nothing?
        // Usually better to have a onCancelled callback, but for now let's treat it as a non-complete state
        // or just end.
        return;
      }

      // Execution Complete
      const finalOutcome = await this.evaluateFinalOutcome(
        recipe,
        results,
        this.currentTabId,
      );
      if (finalOutcome.verdict === "failure") {
        const errorMessage = `Fallo detectado automáticamente (FINAL_OUTCOME): ${finalOutcome.rationale}`;
        const failureStepResult: StepExecutionResult = {
          stepId: `ai-final-${Date.now()}`,
          status: "error",
          message: errorMessage,
          error: errorMessage,
          timestamp: Date.now(),
        };
        results.push(failureStepResult);
        this.onStepResultCallback?.(failureStepResult);
        await this.saveHistory(recipe, "failed", results, errorMessage, {
          subtype: "FORM_VALIDATION",
          message: finalOutcome.rationale,
          timestamp: Date.now(),
          payload: {
            score: finalOutcome.score,
            signals: finalOutcome.signals,
          },
        });
        this.onFailedCallback?.(errorMessage, results);
        this.sendNotification(
          "Error en el flujo",
          "La validación final detectó que el formulario terminó en estado de fallo.",
        );
        this.resetExecutionState();
        return;
      }

      await this.saveHistory(recipe, "completed", results);
      this.onCompleteCallback?.(results);
      this.resetExecutionState();
      this.sendNotification(
        "Flujo completado",
        `El flujo "${recipe.name}" ha finalizado correctamente.`,
      );
    } catch (error) {
      // Top level error
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      await this.saveHistory(recipe, "failed", results, errorMessage);
      this.onFailedCallback?.(errorMessage, results);
      this.resetExecutionState();
      this.sendNotification(
        "Error en el flujo",
        `El flujo "${recipe.name}" ha fallado: ${errorMessage}`,
      );
    }
  }

  /**
   * Helper to save execution history
   */
  private async saveHistory(
    recipe: TestProfile,
    status: "completed" | "failed" | "cancelled",
    steps: StepExecutionResult[],
    error?: string,
    failureSignal?: FailureSignal,
  ) {
    // Import dynamically to avoid circular dependencies if any,
    // or just ensure storageService is available.
    // Since we are inside a class method, standard import at top level is fine.
    // But we need to make sure we imported it.

    const historyEntry: import("../types").RecipeExecutionResult = {
      id: crypto.randomUUID(),
      recipeId: recipe.id,
      recipeName: recipe.name,
      startTime: this.executionStartTime || Date.now(),
      duration: Date.now() - (this.executionStartTime || Date.now()),
      status,
      steps,
      errorMessage: error,
      consoleLogs: this.executionLogs,
      failureSignal,
    };

    // We need to calculate duration properly.
    // Let's use a start time if we tracked it, or sum of steps?
    // A better way is to track startTime in executeRecipe.

    // For now, let's just save it.
    try {
      const { storageService } = await import("./storage");
      await storageService.addToHistory(historyEntry);
    } catch (e) {
      console.error("Failed to save history:", e);
    }
  }

  /**
   * Sends a single step to the content script and waits for result.
   * Handles race conditions where navigation might happen during execution.
   */
  private async executeStepOnContent(
    tabId: number,
    step: any,
  ): Promise<StepExecutionResult> {
    return new Promise((resolve) => {
      // Set a timeout for the step execution
      const timeoutId = setTimeout(() => {
        resolve({
          stepId: step.id,
          status: "error",
          message:
            "Timeout: El paso tardó demasiado o la página se recargó inesperadamente",
          timestamp: Date.now(),
        });
      }, 30000); // 30s timeout

      // Listen for navigation events during this step
      // If navigation happens, we might lose the response, but we detect it here
      const navListener = (
        updatedTabId: number,
        changeInfo: { status?: string },
      ) => {
        if (updatedTabId === tabId && changeInfo.status === "loading") {
          // Navigation started!
          console.log("[ExecutionService] Navigation detected during step");
          clearTimeout(timeoutId);
          chrome.tabs.onUpdated.removeListener(navListener);

          // Wait for completion
          this.waitForPageLoad(tabId).then(() => {
            // If the step effectively caused navigation, we might consider it a success
            // IF it was a CLICK or similar.
            // For now, let's assume if we navigated, the step execution context is lost
            // but we are ready for the next step.
            resolve({
              stepId: step.id,
              status: "success",
              message: "Navegación detectada y completada",
              timestamp: Date.now(),
            });
          });
        }
      };
      chrome.tabs.onUpdated.addListener(navListener);

      chrome.tabs.sendMessage(
        tabId,
        { type: "EXECUTE_STEP", step },
        (response) => {
          clearTimeout(timeoutId);
          chrome.tabs.onUpdated.removeListener(navListener);

          if (chrome.runtime.lastError) {
            // Could happen if page creates execution context invalidation
            console.warn(
              "[ExecutionService] Runtime error:",
              chrome.runtime.lastError,
            );
            // If we are navigating, the listener above handles it.
            // If not, it's a real error.
            return;
          }

          if (response && response.success) {
            resolve(response.result);
          } else {
            resolve({
              stepId: step.id,
              status: "error",
              message: response?.error || "Error desconocido",
              timestamp: Date.now(),
            });
          }
        },
      );
    });
  }

  /**
   * Stop execution on the current tab.
   */
  public async stopExecution(): Promise<void> {
    if (!this.currentTabId) return;

    if (typeof chrome === "undefined" || !chrome.tabs) return;

    try {
      const tabId = this.currentTabId;
      this.currentTabId = null; // This breaks the loop in executeRecipe

      if (typeof chrome === "undefined" || !chrome.tabs) return;

      await chrome.tabs.sendMessage(tabId, {
        type: "STOP_EXECUTION",
      });
    } catch (error) {
      console.error("[ExecutionService] Failed to stop execution:", error);
    }
  }

  // ── Event handlers ──────────────────────────────────────────────

  public onStepResult(callback: StepResultCallback): void {
    this.onStepResultCallback = callback;
  }

  public onComplete(callback: ExecutionCompleteCallback): void {
    this.onCompleteCallback = callback;
  }

  public onFailed(callback: ExecutionFailedCallback): void {
    this.onFailedCallback = callback;
  }

  // ── Private helpers ──────────────────────────────────────────────

  private async waitForPageLoad(tabId: number): Promise<void> {
    return new Promise((resolve) => {
      const listener = (
        updatedTabId: number,
        changeInfo: { status?: string },
      ) => {
        if (updatedTabId === tabId && changeInfo.status === "complete") {
          chrome.tabs.onUpdated.removeListener(listener);
          // Extra wait for scripts to initialize
          setTimeout(resolve, 1000);
        }
      };
      chrome.tabs.onUpdated.addListener(listener);
    });
  }

  private async ensureContentScript(tabId: number): Promise<void> {
    const maxRetries = 5;
    for (let i = 0; i < maxRetries; i++) {
      try {
        await chrome.tabs.sendMessage(tabId, { type: "PING" });
        return;
      } catch {
        if (i === 0) {
          try {
            await chrome.scripting.executeScript({
              target: { tabId },
              files: ["content/content.js"],
            });
            await new Promise((r) => setTimeout(r, 500));
            continue;
          } catch (e) {
            console.error("[ExecutionService] Failed to inject:", e);
          }
        }
        await new Promise((r) => setTimeout(r, 500));
      }
    }
    throw new Error("Content script not available");
  }

  /**
   * Helper to send browser notifications
   */
  private async sendNotification(title: string, message: string) {
    try {
      if (typeof chrome === "undefined" || !chrome.notifications) return;

      const { storageService } = await import("./storage");
      const settings = await storageService.getSettings();

      if (settings?.notificationsEnabled) {
        chrome.notifications.create({
          type: "basic",
          iconUrl: "icon48.png",
          title: `RacTest: ${title}`,
          message: message,
          priority: 2,
        });
      }
    } catch (error) {
      console.error("Failed to send notification:", error);
    }
  }

  private normalizeSubtype(subtype: string): CapturedErrorSubtype | null {
    if (
      subtype === "CONSOLE" ||
      subtype === "WINDOW" ||
      subtype === "PROMISE" ||
      subtype === "NETWORK" ||
      subtype === "FORM_VALIDATION"
    ) {
      return subtype;
    }
    return null;
  }

  private formatSignalMessage(
    subtype: CapturedErrorSubtype,
    payload: unknown,
  ): string {
    if (subtype === "NETWORK" && payload && typeof payload === "object") {
      const net = payload as {
        method?: string;
        url?: string;
        status?: number;
        statusText?: string;
        error?: string;
      };
      if (net.error)
        return `${net.method || "REQUEST"} ${net.url || ""} ${net.error}`.trim();
      if (typeof net.status === "number") {
        return `${net.method || "REQUEST"} ${net.url || ""} ${net.status} ${net.statusText || ""}`.trim();
      }
    }

    return typeof payload === "string"
      ? payload
      : JSON.stringify(payload ?? "Error desconocido");
  }

  private isHardFailureSignal(signal: FailureSignal): boolean {
    if (signal.subtype === "WINDOW" || signal.subtype === "PROMISE") {
      return true;
    }

    if (signal.subtype === "NETWORK") {
      const payload = signal.payload as { status?: number } | undefined;
      const status = payload?.status;
      if (typeof status === "number") {
        return status >= 400;
      }
      return true;
    }

    if (signal.subtype === "FORM_VALIDATION") {
      return true;
    }

    return false;
  }

  private async checkReactiveFailureOnContent(
    tabId: number,
    stepAction: TestStep["action"],
    stepMessage?: string,
    previousSnapshot?: unknown,
  ): Promise<FailureSignal | null> {
    return new Promise((resolve) => {
      chrome.tabs.sendMessage(
        tabId,
        {
          type: "CHECK_REACTIVE_FAILURES",
          stepAction,
          stepMessage,
          previousSnapshot,
        },
        (response) => {
          if (chrome.runtime.lastError) {
            resolve(null);
            return;
          }

          if (response?.success && response.signal) {
            const subtype = this.normalizeSubtype(response.signal.subtype);
            if (!subtype) {
              resolve(null);
              return;
            }

            resolve({
              subtype,
              message: String(response.signal.message || "Error de formulario"),
              timestamp: Number(response.signal.timestamp || Date.now()),
              payload: response.signal.payload,
            });
            return;
          }

          resolve(null);
        },
      );
    });
  }

  private async prepareReactiveObservationOnContent(
    tabId: number,
  ): Promise<unknown | null> {
    return await new Promise<unknown | null>((resolve) => {
      chrome.tabs.sendMessage(
        tabId,
        { type: "PREPARE_REACTIVE_OBSERVATION" },
        (response) => {
          if (chrome.runtime.lastError) {
            resolve(null);
            return;
          }
          if (response?.success) {
            resolve(response.snapshot ?? null);
            return;
          }
          resolve(null);
        },
      );
    });
  }

  private consumePendingFailureSignal(): FailureSignal | null {
    return this.pendingFailureSignals.shift() ?? null;
  }

  private async waitForHardFailureSignal(
    durationMs: number,
  ): Promise<FailureSignal | null> {
    const immediateSignal = this.consumePendingFailureSignal();
    if (immediateSignal) return immediateSignal;

    if (durationMs <= 0) return null;

    const intervalMs = 100;
    const started = Date.now();
    while (Date.now() - started < durationMs) {
      const signal = this.consumePendingFailureSignal();
      if (signal) return signal;
      await this.wait(intervalMs);
    }
    return this.consumePendingFailureSignal();
  }

  private wait(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private resetExecutionState() {
    this.isExecuting = false;
    this.pendingFailureSignals = [];
    this.currentTabId = null;
  }

  private async getAutomationFeedbackOnContent(
    tabId: number,
  ): Promise<AutomationFeedbackSnapshot | null> {
    return await new Promise((resolve) => {
      chrome.tabs.sendMessage(
        tabId,
        { type: "GET_AUTOMATION_FEEDBACK" },
        (response) => {
          if (chrome.runtime.lastError) {
            resolve(null);
            return;
          }
          if (response?.success && response.feedback) {
            resolve(response.feedback);
            return;
          }
          resolve(null);
        },
      );
    });
  }

  private isCriticalCommitStep(step: TestStep, message?: string): boolean {
    if (step.action !== "CLICK") return false;
    const text = `${step.selector || ""} ${message || ""}`.toLowerCase();
    return /(submit|save|create|register|signup|sign up|enviar|guardar|continuar|confirm)/i.test(
      text,
    );
  }

  private getNormalizedRole(role: string): string {
    return String(role || "")
      .trim()
      .toLowerCase();
  }

  private isKnownAriaRole(role: string): boolean {
    const normalized = this.getNormalizedRole(role);
    if (!normalized) return false;
    return roles.has(normalized as any);
  }

  private isAlertLikeRole(role: string): boolean {
    const normalized = this.getNormalizedRole(role);
    return normalized === "alert" || normalized === "alertdialog";
  }

  private isStatusLikeRole(role: string): boolean {
    const normalized = this.getNormalizedRole(role);
    return normalized === "status" || normalized === "log";
  }

  private async collectTemporalEvidenceWindow(
    tabId: number,
    durationMs = 4500,
    intervalMs = 300,
  ): Promise<TemporalEvidenceWindow> {
    const startedAt = Date.now();
    const snapshots: AutomationFeedbackSnapshot[] = [];

    while (Date.now() - startedAt <= durationMs) {
      const snapshot = await this.getAutomationFeedbackOnContent(tabId);
      if (snapshot) snapshots.push(snapshot);
      await this.wait(intervalMs);
    }

    return {
      startedAt,
      endedAt: Date.now(),
      samples: snapshots.length,
      snapshots,
    };
  }

  private evaluateDeterministicOutcomeFromWindow(
    evidence: TemporalEvidenceWindow,
  ): DeterministicOutcome {
    const signals: string[] = [];
    let score = 0;

    const allItems = evidence.snapshots.flatMap((s) => s.feedbackItems);
    const invalidFieldsCount = new Set(
      evidence.snapshots.flatMap((s) => s.invalidFields),
    ).size;

    const hasFailureText = allItems.some((item) =>
      ExecutionService.FAILURE_KEYWORDS.test(
        `${item.text} ${item.className} ${item.role} ${item.ariaLive} ${item.accessibleName || ""} ${item.accessibleDescription || ""} ${item.labelText || ""}`,
      ),
    );
    if (hasFailureText) {
      score += 5;
      signals.push("failure_text_detected");
    }

    const hasFailureStyle = allItems.some((item) =>
      /(danger|error|invalid|alert-danger|text-danger)/i.test(item.className),
    );
    if (hasFailureStyle) {
      score += 4;
      signals.push("failure_style_detected");
    }

    const hasRoleAlertFailure = allItems.some((item) => {
      const role = this.getNormalizedRole(item.role);
      if (!role || !this.isKnownAriaRole(role)) return false;
      if (!this.isAlertLikeRole(role)) return false;
      return ExecutionService.FAILURE_KEYWORDS.test(
        `${item.text || ""} ${item.className || ""} ${item.accessibleName || ""} ${item.accessibleDescription || ""}`,
      );
    });
    if (hasRoleAlertFailure) {
      score += 3;
      signals.push("role_alert_failure");
    }

    const hasAssertiveFailure = allItems.some((item) => {
      const live = this.getNormalizedRole(item.ariaLive);
      if (live !== "assertive") return false;
      return ExecutionService.FAILURE_KEYWORDS.test(
        `${item.text || ""} ${item.className || ""} ${item.accessibleName || ""} ${item.accessibleDescription || ""}`,
      );
    });
    if (hasAssertiveFailure) {
      score += 2;
      signals.push("assertive_failure_feedback");
    }

    const noisyStatusSpinner = allItems.some((item) => {
      const role = this.getNormalizedRole(item.role);
      if (!this.isStatusLikeRole(role)) return false;
      const text = `${item.text || ""} ${item.accessibleName || ""}`.trim();
      const cls = String(item.className || "").toLowerCase();
      return !text && /(spinner|loading|loader|progress)/i.test(cls);
    });
    if (noisyStatusSpinner) {
      score -= 1;
      signals.push("status_spinner_noise");
    }

    if (invalidFieldsCount > 0) {
      score += 5;
      signals.push(`invalid_fields:${invalidFieldsCount}`);
    }

    const hasSuccessText = allItems.some((item) => {
      const text = `${item.text || ""} ${item.className || ""} ${item.accessibleName || ""} ${item.accessibleDescription || ""}`;
      if (!ExecutionService.SUCCESS_KEYWORDS.test(text)) return false;
      const role = this.getNormalizedRole(item.role);
      if (!role) return true;
      if (!this.isKnownAriaRole(role)) return true;
      return (
        !this.isAlertLikeRole(role) ||
        /success|created|saved|completed|welcome/i.test(text)
      );
    });
    if (hasSuccessText) {
      score -= 4;
      signals.push("success_text_detected");
    }

    if (score >= 6) {
      return {
        verdict: "failure",
        rationale:
          allItems.find((item) =>
            ExecutionService.FAILURE_KEYWORDS.test(
              `${item.text} ${item.className} ${item.role} ${item.accessibleName || ""} ${item.accessibleDescription || ""}`,
            ),
          )?.text ||
          "Deterministic rules detected visible failure signals after submit.",
        score,
        signals,
      };
    }

    if (score <= -4) {
      return {
        verdict: "success",
        rationale: "Deterministic rules detected strong success signals.",
        score,
        signals,
      };
    }

    return {
      verdict: "inconclusive",
      rationale: "Deterministic rules found mixed or weak signals.",
      score,
      signals,
    };
  }

  private async evaluateFinalOutcome(
    recipe: TestProfile,
    results: StepExecutionResult[],
    tabId: number | null,
  ): Promise<DeterministicOutcome> {
    if (!tabId) {
      return {
        verdict: "inconclusive",
        rationale: "No active tab for final evaluation.",
        score: 0,
        signals: ["no_active_tab"],
      };
    }

    const evidence = await this.collectTemporalEvidenceWindow(tabId, 3500, 300);
    const deterministic = this.evaluateDeterministicOutcomeFromWindow(evidence);
    if (deterministic.verdict !== "inconclusive") return deterministic;

    try {
      const [{ openRouterService }, { storageService }] = await Promise.all([
        import("../../modules/ai-assistant/services/openRouterService"),
        import("./storage"),
      ]);
      const settings = await storageService.getSettings();
      const aiEnabled = settings.enableAiForTesting !== false;
      if (!aiEnabled) {
        return {
          ...deterministic,
          rationale:
            deterministic.rationale +
            " AI disambiguation disabled in settings.",
          signals: [...deterministic.signals, "ai_disabled_in_settings"],
        };
      }

      if (!settings.openRouterApiKey) {
        return {
          ...deterministic,
          rationale:
            deterministic.rationale +
            " No API key configured for AI disambiguation.",
          signals: [...deterministic.signals, "no_api_key_for_ai"],
        };
      }

      const latestSnapshot = evidence.snapshots[
        evidence.snapshots.length - 1
      ] || {
        url: recipe.url,
        title: "",
        feedbackItems: [],
        invalidFields: [],
      };

      const systemPrompt = `
        You are RacTest final test outcome validator.
        Determine if this automated test run ended in success, failure, or inconclusive.
        Use all evidence: visible feedback texts, classes, roles, aria-live, colors, invalid fields, and executed steps.

        Return strict JSON:
        {
          "verdict": "success" | "failure" | "inconclusive",
          "rationale": "short evidence-based explanation"
        }

        Rules:
        - If visible feedback indicates signup/register/create failed, return failure.
        - Do not infer success only because steps executed.
        - If evidence is weak/conflicting, return inconclusive.
        - Do NOT provide QA commentary, advice, or explanations outside JSON.
        - Output JSON only.
      `;

      const userPrompt = `
        Recipe: ${recipe.name}
        Recipe URL: ${recipe.url}
        Current URL: ${latestSnapshot.url}
        Title: ${latestSnapshot.title}

        Step results:
        ${results
          .map((r, i) => `${i + 1}. ${r.status} - ${r.message || ""}`)
          .join("\n")}

        Invalid fields:
        ${latestSnapshot.invalidFields.join(", ") || "none"}

        Visual feedback items:
        ${JSON.stringify(latestSnapshot.feedbackItems.slice(0, 20), null, 2)}

        Deterministic pre-score:
        ${JSON.stringify(
          { score: deterministic.score, signals: deterministic.signals },
          null,
          2,
        )}
      `;
      console.debug("[RacTest][Execution][AI Final Eval Payload]", {
        recipe: recipe.name,
        recipeUrl: recipe.url,
        currentUrl: latestSnapshot.url,
        title: latestSnapshot.title,
        stepResults: results.map((r) => ({
          stepId: r.stepId,
          status: r.status,
          message: r.message,
        })),
        invalidFields: latestSnapshot.invalidFields,
        feedbackItems: latestSnapshot.feedbackItems.slice(0, 20),
        deterministic,
        samples: evidence.samples,
        userPromptPreview: userPrompt.slice(0, 1800),
      });

      const response = await openRouterService.generateCompletion(
        systemPrompt,
        userPrompt,
      );

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
      const rationale =
        typeof parsed?.rationale === "string" && parsed.rationale.trim()
          ? parsed.rationale.trim().slice(0, 300)
          : "AI returned no rationale.";
      return {
        verdict,
        rationale,
        score: deterministic.score,
        signals: [...deterministic.signals, "ai_disambiguation"],
      };
    } catch (error) {
      return {
        ...deterministic,
        rationale:
          deterministic.rationale + ` AI final check failed: ${String(error)}`,
        signals: [...deterministic.signals, "ai_error"],
      };
    }
  }
}

// Export singleton
export const executionService = new ExecutionService();
