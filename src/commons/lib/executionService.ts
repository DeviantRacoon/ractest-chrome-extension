/**
 * Execution Service
 * Panel-side service that manages communication with the content script
 * for recipe execution. Handles sending commands and receiving results.
 */

import type {
  CapturedErrorSubtype,
  FailureSignal,
  StepExecutionResult,
  TestStep,
  TestProfile,
} from "../types";
import type { ContentToPopupMessage } from "../types/messages";

type StepResultCallback = (result: StepExecutionResult) => void;
type ExecutionCompleteCallback = (results: StepExecutionResult[]) => void;
type ExecutionFailedCallback = (
  error: string,
  results: StepExecutionResult[],
) => void;

export class ExecutionService {
  private onStepResultCallback: StepResultCallback | null = null;
  private onCompleteCallback: ExecutionCompleteCallback | null = null;
  private onFailedCallback: ExecutionFailedCallback | null = null;
  private currentTabId: number | null = null;
  private executionLogs: import("../types").ConsoleLogEntry[] = [];
  private isExecuting = false;
  private executionStartTime = 0;
  private pendingFailureSignals: FailureSignal[] = [];

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

              this.executionLogs.push({
                timestamp: signal.timestamp,
                level: "error",
                message: `[${signal.subtype}] ${signal.message}`,
              });

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
  public async executeRecipe(recipe: TestProfile): Promise<void> {
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

    // Execute steps one by one
    const results: StepExecutionResult[] = [];
    this.executionLogs = []; // Reset logs

    try {
      // Execute steps one by one
      for (const step of recipe.steps) {
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
      if (net.error) return `${net.method || "REQUEST"} ${net.url || ""} ${net.error}`.trim();
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
}

// Export singleton
export const executionService = new ExecutionService();
