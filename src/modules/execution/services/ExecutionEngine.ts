/**
 * ExecutionEngine
 * Runs recipe steps sequentially inside the content script context.
 * Reports per-step results back to the panel via chrome.runtime.sendMessage.
 */

import type {
  FailureSignal,
  ConsoleLogEntry,
  StepExecutionResult,
  TestStep,
} from "../../../commons/types";
import { OverlaySystem } from "../../inspector/components/OverlaySystem";

interface ReactiveSnapshot {
  timestamp: number;
  url: string;
  title: string;
  invalidFields: string[];
  alertTexts: string[];
  errorTexts: string[];
  errorHtmlChunks: string[];
  errorContainerCount: number;
  hash: string;
}

export class ExecutionEngine {
  private cancelled = false;
  private overlay: OverlaySystem;
  private consoleLogs: ConsoleLogEntry[] = [];
  private logListener?: (event: MessageEvent) => void;
  private initialized = false;
  private previousReactiveSnapshot: ReactiveSnapshot | null = null;

  constructor() {
    this.overlay = new OverlaySystem();
    // distinct color for execution (e.g. Blue/Purple)
    this.overlay.setHighlightColor("#8B5CF6");
  }

  /**
   * Execute a single step and return the result immediately.
   */
  public async executeSingleStep(step: TestStep): Promise<StepExecutionResult> {
    await this.ensureInitialized();
    console.log(
      `[ExecutionEngine] Executing single step: ${step.action} ${step.selector}`,
    );
    return await this.executeStep(step);
  }

  /**
   * Execute a list of steps sequentially.
   * Sends STEP_RESULT for each step, then EXECUTION_COMPLETE or EXECUTION_FAILED.
   * @deprecated logic moved to ExecutionService for persistence
   */
  public async execute(recipeId: string, steps: TestStep[]): Promise<void> {
    this.cancelled = false;
    const results: StepExecutionResult[] = [];
    this.consoleLogs = [];

    this.consoleLogs = [];

    // Ensure logger is initialized
    await this.ensureInitialized();

    console.log(
      `[ExecutionEngine] Starting recipe ${recipeId} with ${steps.length} steps`,
    );

    for (const step of steps) {
      if (this.cancelled) {
        results.push({
          stepId: step.id,
          status: "skipped",
          message: "Ejecución cancelada por el usuario",
          timestamp: Date.now(),
        });
        this.sendStepResult(results[results.length - 1]);
        continue;
      }

      const result = await this.executeStep(step);
      results.push(result);
      this.sendStepResult(result);

      if (result.status === "error") {
        // Stop on first error
        // Mark remaining steps as skipped
        const currentIndex = steps.indexOf(step);
        for (let i = currentIndex + 1; i < steps.length; i++) {
          const skipped: StepExecutionResult = {
            stepId: steps[i].id,
            status: "skipped",
            message: "Saltado por error en paso anterior",
            timestamp: Date.now(),
          };
          results.push(skipped);
          this.sendStepResult(skipped);
        }

        chrome.runtime.sendMessage({
          type: "EXECUTION_FAILED",
          recipeId,
          error: result.message || "Error desconocido",
          results,
          consoleLogs: this.consoleLogs,
        });
        this.cleanupLogListener();
        return;
      }

      // Wait the configured delay before next step
      if (step.delay > 0 && !this.cancelled) {
        await this.wait(step.delay);
      }
    }

    chrome.runtime.sendMessage({
      type: "EXECUTION_COMPLETE",
      recipeId,
      results,
      consoleLogs: this.consoleLogs,
    });

    this.cleanupLogListener();

    console.log(`[ExecutionEngine] Recipe ${recipeId} completed successfully`);
  }

  /**
   * Cancel a running execution.
   */
  public stop(): void {
    this.cancelled = true;
    this.overlay.hide();
    this.cleanupLogListener();
    this.initialized = false;
    console.log("[ExecutionEngine] Execution cancelled");
  }

  /**
   * Creates a baseline snapshot before executing a step.
   */
  public prepareReactiveObservation(): ReactiveSnapshot {
    this.previousReactiveSnapshot = this.captureReactiveSnapshot();
    return this.previousReactiveSnapshot;
  }

  /**
   * Detects reactive UI failures by comparing semantic snapshots (before/after step).
   */
  public checkReactiveFailure(
    stepAction?: TestStep["action"],
    stepMessage?: string,
    previousSnapshot?: unknown,
  ): FailureSignal | null {
    const currentSnapshot = this.captureReactiveSnapshot();
    const baseline = this.isReactiveSnapshot(previousSnapshot)
      ? previousSnapshot
      : this.previousReactiveSnapshot;
    this.previousReactiveSnapshot = currentSnapshot;

    if (!baseline || stepAction === "DIVIDER") return null;

    const diff = this.diffSnapshots(baseline, currentSnapshot);
    const canTriggerStrictValidation =
      stepAction === "CLICK" ||
      stepAction === "SELECT" ||
      stepAction === "CHECK" ||
      stepAction === "UNCHECK";
    const submitReloadCandidate =
      stepAction === "CLICK" &&
      /navegaci[oó]n detectada/i.test(stepMessage || "");

    const shouldFail =
      diff.newInvalidFields.length > 0 ||
      diff.newAlertTexts.length > 0 ||
      diff.newErrorTexts.length > 0 ||
      (canTriggerStrictValidation &&
        diff.invalidFieldCountIncreased &&
        currentSnapshot.invalidFields.length > 0) ||
      (canTriggerStrictValidation &&
        diff.errorHtmlChanged &&
        currentSnapshot.errorTexts.length > 0) ||
      (submitReloadCandidate &&
        diff.domChanged &&
        (currentSnapshot.invalidFields.length > 0 ||
          currentSnapshot.errorTexts.length > 0 ||
          currentSnapshot.errorContainerCount > 0));

    if (!shouldFail) return null;

    return {
      subtype: "FORM_VALIDATION",
      message: this.buildDiffFailureMessage(diff, currentSnapshot),
      timestamp: Date.now(),
      payload: {
        kind: "dom_diff",
        submitReloadCandidate,
        diff,
        before: {
          hash: baseline.hash,
          invalidCount: baseline.invalidFields.length,
          errorCount: baseline.errorTexts.length,
          errorContainerCount: baseline.errorContainerCount,
        },
        after: {
          hash: currentSnapshot.hash,
          invalidCount: currentSnapshot.invalidFields.length,
          errorCount: currentSnapshot.errorTexts.length,
          errorContainerCount: currentSnapshot.errorContainerCount,
          url: currentSnapshot.url,
        },
        errorHtmlChunks: currentSnapshot.errorHtmlChunks.slice(0, 4),
      },
    };
  }

  // ── Private helpers ──────────────────────────────────────────────

  private async ensureInitialized() {
    if (this.initialized) return;

    // Request console interceptor injection from background (to bypass CSP)
    await chrome.runtime.sendMessage({ type: "INJECT_LOGGER" });
    this.setupLogListener();

    this.initialized = true;
  }

  private setupLogListener() {
    this.logListener = (event: MessageEvent) => {
      if (
        event.source === window &&
        event.data &&
        event.data.source === "RACTEST_CONSOLE_LOG"
      ) {
        const logEntry = event.data.payload;
        this.consoleLogs.push(logEntry);

        // Stream log to side panel/background
        chrome.runtime
          .sendMessage({
            type: "CONSOLE_LOG",
            logEntry,
          })
          .catch(() => {
            // Ignore errors if side panel is closed
          });
      }
    };
    window.addEventListener("message", this.logListener);
  }

  private cleanupLogListener() {
    if (this.logListener) {
      window.removeEventListener("message", this.logListener);
      this.logListener = undefined;
    }
  }

  private async executeStep(step: TestStep): Promise<StepExecutionResult> {
    try {
      if (step.action === "DIVIDER") {
        return {
          stepId: step.id,
          status: "success",
          message: `Sección: ${step.value}`,
          timestamp: Date.now(),
        };
      }

      const element = this.findElement(step.selector);
      if (!element) {
        return {
          stepId: step.id,
          status: "error",
          message: `Elemento no encontrado: ${step.selector}`,
          timestamp: Date.now(),
        };
      }

      // VISUAL FEEDBACK
      this.overlay.highlightElement(element, `Executing: ${step.action}`);
      await this.wait(800); // Wait for user to see the highlight
      this.overlay.hide();

      await this.performAction(element, step);

      return {
        stepId: step.id,
        status: "success",
        message: `${step.action} ejecutado correctamente`,
        timestamp: Date.now(),
      };
    } catch (error) {
      return {
        stepId: step.id,
        status: "error",
        message: error instanceof Error ? error.message : String(error),
        timestamp: Date.now(),
      };
    }
  }

  /**
   * Find an element using CSS selector or XPath.
   */
  private findElement(selector: string): HTMLElement | null {
    // Try XPath first if selector starts with //
    if (selector.startsWith("//") || selector.startsWith("(//")) {
      try {
        const result = document.evaluate(
          selector,
          document,
          null,
          XPathResult.FIRST_ORDERED_NODE_TYPE,
          null,
        );
        return result.singleNodeValue as HTMLElement | null;
      } catch {
        // Fall through to CSS selector
      }
    }

    // Try CSS selector
    try {
      return document.querySelector(selector) as HTMLElement;
    } catch {
      return null;
    }
  }

  /**
   * Perform the specified action on the element.
   */
  private async performAction(
    element: HTMLElement,
    step: TestStep,
  ): Promise<void> {
    const { action, value } = step;
    // Scroll element into view
    element.scrollIntoView({ behavior: "smooth", block: "center" });
    await this.wait(200); // Small wait after scroll

    switch (action) {
      case "CLICK":
        this.simulateClick(element);
        break;

      case "TYPE":
        if (value === undefined && !step.useFakeData)
          throw new Error("TYPE requiere un valor o usar Fake Data");

        // Handle unique text generation or Fake Data
        let finalValue = value || "";

        if (step.useFakeData && step.fakeDataType) {
          const { faker } = await import("@faker-js/faker/locale/es");
          switch (step.fakeDataType) {
            case "email":
              finalValue = faker.internet.email();
              break;
            case "name":
              finalValue = faker.person.fullName();
              break;
            case "firstName":
              finalValue = faker.person.firstName();
              break;
            case "lastName":
              finalValue = faker.person.lastName();
              break;
            case "username":
              finalValue = faker.internet.username();
              break;
            case "password":
              finalValue = faker.internet.password({
                length: 14,
                memorable: false,
                pattern: /[A-Za-z0-9!@#$%]/,
              });
              break;
            case "phone":
              finalValue = faker.phone.number();
              break;
            case "address":
              finalValue = faker.location.streetAddress();
              break;
            case "city":
              finalValue = faker.location.city();
              break;
            case "state":
              finalValue = faker.location.state();
              break;
            case "zipCode":
              finalValue = faker.location.zipCode();
              break;
            case "country":
              finalValue = faker.location.country();
              break;
            case "company":
              finalValue = faker.company.name();
              break;
            case "jobTitle":
              finalValue = faker.person.jobTitle();
              break;
            case "url":
              finalValue = faker.internet.url();
              break;
            case "date":
              finalValue = faker.date.future().toLocaleDateString("es-ES");
              break;
            case "time":
              finalValue = faker.date
                .soon({ days: 1 })
                .toLocaleTimeString("es-ES", {
                  hour: "2-digit",
                  minute: "2-digit",
                });
              break;
            case "datetime":
              finalValue = faker.date.soon({ days: 30 }).toISOString();
              break;
            case "number":
              finalValue = String(faker.number.int({ min: 1, max: 999999 }));
              break;
            case "price":
              finalValue = faker.commerce.price({
                min: 10,
                max: 5000,
                dec: 2,
              });
              break;
            case "uuid":
              finalValue = faker.string.uuid();
              break;
            case "color":
              finalValue = faker.color.rgb({ format: "hex" });
              break;
            case "lorem":
              finalValue = faker.lorem.paragraph();
              break;
            default:
              finalValue = faker.person.fullName();
          }
        } else if (step.uniqueText) {
          const uniqueId = crypto.randomUUID();
          finalValue = `${finalValue}-${uniqueId}`;
        }

        await this.simulateType(element as HTMLInputElement, finalValue);
        break;

      case "SELECT":
        if (value === undefined) throw new Error("SELECT requiere un valor");
        this.simulateSelect(element as HTMLSelectElement, value);
        break;

      case "CHECK":
        this.simulateCheck(element as HTMLInputElement, true);
        break;

      case "UNCHECK":
        this.simulateCheck(element as HTMLInputElement, false);
        break;

      case "DIVIDER":
        // Do nothing for divider
        break;

      default:
        throw new Error(`Acción desconocida: ${action}`);
    }
  }

  private simulateClick(element: HTMLElement): void {
    // Calculate center coordinates
    const rect = element.getBoundingClientRect();
    const clientX = rect.left + rect.width / 2;
    const clientY = rect.top + rect.height / 2;
    // Screen coordinates are approximate but better than 0
    const screenX = window.screenX + clientX;
    const screenY = window.screenY + clientY;

    const eventOptions: MouseEventInit = {
      bubbles: true,
      cancelable: true,
      view: window,
      detail: 1,
      screenX,
      screenY,
      clientX,
      clientY,
      ctrlKey: false,
      altKey: false,
      shiftKey: false,
      metaKey: false,
      button: 0,
      buttons: 1,
      relatedTarget: null,
    };

    const pointerEventOptions: PointerEventInit = {
      ...eventOptions,
      pointerId: 1,
      width: 1,
      height: 1,
      pressure: 0.5,
      tangentialPressure: 0,
      tiltX: 0,
      tiltY: 0,
      twist: 0,
      pointerType: "mouse",
      isPrimary: true,
    };

    // Dispatch full event sequence for maximum compatibility
    element.dispatchEvent(new PointerEvent("pointerdown", pointerEventOptions));
    element.dispatchEvent(new MouseEvent("mousedown", eventOptions));

    // Tiny delay between down and up can help some drag-detection logic
    // but we can't await here easily without changing signature.
    // Synchronous dispatch is usually fine for click.

    element.dispatchEvent(new PointerEvent("pointerup", pointerEventOptions));
    element.dispatchEvent(new MouseEvent("mouseup", eventOptions));
    element.dispatchEvent(new MouseEvent("click", eventOptions));

    // Note: We avoid element.click() here if we want to rely purely on events,
    // but element.click() is safest for navigation/forms.
    // However, for complex UI libraries, the events above are what matters.
    // If we call click(), it might fire another set of events.
    // Let's keep it for now as a fallback but relying on the dispatched events first.
    // element.click();
  }

  private async simulateType(
    element: HTMLElement,
    value: string,
  ): Promise<void> {
    // Determine input type
    const isInput =
      element instanceof HTMLInputElement ||
      element instanceof HTMLTextAreaElement;
    const isContentEditable =
      element.isContentEditable ||
      element.getAttribute("contenteditable") === "true";

    // Focus the element
    element.focus();
    element.dispatchEvent(new FocusEvent("focus", { bubbles: true }));

    // Click it to ensure activation (common in some editors)
    element.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    // Clear existing value
    if (isInput) {
      (element as HTMLInputElement | HTMLTextAreaElement).value = "";
    } else if (isContentEditable) {
      element.innerText = "";
    }

    // Dispatch input to notify clear
    element.dispatchEvent(new Event("input", { bubbles: true }));

    // Type character by character for realistic simulation
    for (const char of value) {
      if (this.cancelled) break;

      // Update value
      if (isInput) {
        (element as HTMLInputElement | HTMLTextAreaElement).value += char;
      } else if (isContentEditable) {
        element.innerText += char;
      }

      // Dispatch events
      element.dispatchEvent(
        new KeyboardEvent("keydown", { key: char, bubbles: true }),
      );
      element.dispatchEvent(
        new KeyboardEvent("keypress", { key: char, bubbles: true }),
      );
      // Input event is the most critical for frameworks
      element.dispatchEvent(
        new InputEvent("input", {
          bubbles: true,
          inputType: "insertText",
          data: char,
          isComposing: false,
        }),
      );
      element.dispatchEvent(
        new KeyboardEvent("keyup", { key: char, bubbles: true }),
      );

      // Small delay between characters for realism
      await this.wait(30);
    }

    // Trigger change event
    element.dispatchEvent(new Event("change", { bubbles: true }));
    // For contenteditable, blur often triggers the save
    element.blur();
    element.dispatchEvent(new FocusEvent("blur", { bubbles: true }));
  }

  private simulateSelect(element: HTMLElement, value: string): void {
    let targetSelect = element as HTMLSelectElement;

    // Handle Select2 container targeting
    // User might target the span like #select2-id_client-container
    if (element.tagName !== "SELECT") {
      console.log(
        "[ExecutionEngine] Target is not a SELECT, strictly checking for Select2 pattern...",
      );

      // Pattern 1: ID based (select2-[ID]-container)
      if (
        element.id &&
        element.id.startsWith("select2-") &&
        element.id.endsWith("-container")
      ) {
        // extract original ID: select2-id_client-container -> id_client
        const originalId = element.id
          .replace(/^select2-/, "")
          .replace(/-container$/, "");
        const originalElement = document.getElementById(originalId);
        if (originalElement instanceof HTMLSelectElement) {
          console.log(
            `[ExecutionEngine] Found underlying Select2 element: #${originalId}`,
          );
          targetSelect = originalElement;
        }
      }
      // Pattern 2: Class based or Siblings (simplified check)
      else if (element.classList.contains("select2-selection")) {
        // Try to find the select relative to the container hierarchy
        // This is harder to genericize unique selectors for, but let's try a common close sibling
        const container = element.closest(".select2-container");
        if (
          container &&
          container.previousElementSibling instanceof HTMLSelectElement
        ) {
          targetSelect = container.previousElementSibling;
        }
      }
    }

    if (targetSelect.tagName !== "SELECT") {
      throw new Error(
        `La acción SELECT requiere un elemento <select>. Se encontró: <${element.tagName.toLowerCase()}>. Intenta seleccionar el elemento original (posiblemente oculto) o usa su ID.`,
      );
    }

    // Perform standard select
    targetSelect.focus();
    targetSelect.value = value;
    targetSelect.dispatchEvent(new Event("change", { bubbles: true }));
    targetSelect.dispatchEvent(new Event("input", { bubbles: true }));

    // FORCE UPDATE via Page Context (for jQuery/Select2)
    // We inject a script to run in the page's context where 'window.jQuery' might exist
    this.triggerPageContextChange(targetSelect, value);
  }

  /**
   * Injects a temporary script to trigger events in the page context.
   * This is necessary for libraries like Select2/jQuery that listen to events
   * attached to the DOM element in the main world, not the isolated content script world.
   */
  private triggerPageContextChange(
    element: HTMLSelectElement,
    value: string,
  ): void {
    const script = document.createElement("script");
    // We use the element's ID if available, usually reliable for form inputs
    // If no ID, we can't easily reference it from the injected script without complex selector generation
    if (!element.id) return;

    script.textContent = `
        (function() {
          try {
            var el = document.getElementById('${element.id}');
            if (!el) return;

            // 1. Try jQuery / Select2
            if (window.jQuery) {
              window.jQuery(el).val('${value}').trigger('change');
              console.log('[RacTest Page Script] Triggered jQuery change on #' + el.id);
            }

            // 2. Dispatch native events just in case (sometimes clearing value first helps specific frameworks)
            // el.dispatchEvent(new Event('change', { bubbles: true }));
          } catch(e) {
            console.error('[RacTest Page Script] Error triggering change:', e);
          }
        })();
      `;

    (document.head || document.documentElement).appendChild(script);
    script.remove();
  }

  private simulateCheck(element: HTMLInputElement, checked: boolean): void {
    const inputType = (element.type || "").toLowerCase();
    if (inputType === "radio" && !checked) {
      return;
    }

    if (element.checked !== checked) {
      // Prefer native click because many frameworks depend on click handlers.
      element.click();

      // Fallback when click does not update checked state.
      if (element.checked !== checked) {
        const checkedSetter = Object.getOwnPropertyDescriptor(
          window.HTMLInputElement.prototype,
          "checked",
        )?.set;

        if (checkedSetter) {
          checkedSetter.call(element, checked);
        } else {
          element.checked = checked;
        }
        element.dispatchEvent(new Event("input", { bubbles: true }));
        element.dispatchEvent(new Event("change", { bubbles: true }));
      }
    }
  }

  private sendStepResult(result: StepExecutionResult): void {
    chrome.runtime.sendMessage({ type: "STEP_RESULT", result });
  }

  private captureReactiveSnapshot(): ReactiveSnapshot {
    const invalidFields = this.collectInvalidFields();
    const alertTexts = this.collectAlertTexts();
    const errorNodes = this.findVisibleErrorNodes();
    const errorTexts = this.uniqueStrings(errorNodes.map((n) => n.text));
    const errorHtmlChunks = this.uniqueStrings(
      errorNodes.map((n) => this.getErrorHtmlSnippet(n.element)),
    );

    const hashInput = JSON.stringify({
      url: location.href,
      title: document.title,
      invalidFields,
      alertTexts,
      errorTexts,
    });

    return {
      timestamp: Date.now(),
      url: location.href,
      title: document.title,
      invalidFields,
      alertTexts,
      errorTexts,
      errorHtmlChunks,
      errorContainerCount: errorNodes.length,
      hash: this.simpleHash(hashInput),
    };
  }

  private collectInvalidFields(): string[] {
    const invalidNative = Array.from(
      document.querySelectorAll<HTMLElement>(
        "input:invalid, select:invalid, textarea:invalid",
      ),
    )
      .filter((el) => this.isElementVisible(el))
      .map((el) => this.getValidationMessage(el));

    const invalidAria = Array.from(
      document.querySelectorAll<HTMLElement>('[aria-invalid="true"]'),
    )
      .filter((el) => this.isElementVisible(el))
      .map((el) => `aria-invalid:${this.getElementLabel(el)}`);

    return this.uniqueStrings([...invalidNative, ...invalidAria]);
  }

  private collectAlertTexts(): string[] {
    const alertSelectors = [
      '[role="alert"]',
      '[role="status"]',
      '[role="alertdialog"]',
      '[aria-live="assertive"]',
      '[aria-live="polite"]',
    ].join(",");

    const errorPattern =
      /(error|invalid|required|obligatorio|requerido|incorrect|must|debe|not valid|is required|failed|failure)/i;

    return this.uniqueStrings(
      Array.from(document.querySelectorAll<HTMLElement>(alertSelectors))
        .filter((el) => this.isElementVisible(el))
        .map((el) => (el.innerText || "").replace(/\s+/g, " ").trim())
        .filter((text) => text.length > 4 && errorPattern.test(text))
        .map((text) => text.slice(0, 180)),
    );
  }

  private diffSnapshots(previous: ReactiveSnapshot, current: ReactiveSnapshot) {
    const prevInvalidSet = new Set(previous.invalidFields);
    const prevAlertSet = new Set(previous.alertTexts);
    const prevErrorSet = new Set(previous.errorTexts);
    const prevHtmlSet = new Set(previous.errorHtmlChunks);

    const newInvalidFields = current.invalidFields.filter(
      (item) => !prevInvalidSet.has(item),
    );
    const newAlertTexts = current.alertTexts.filter(
      (item) => !prevAlertSet.has(item),
    );
    const newErrorTexts = current.errorTexts.filter(
      (item) => !prevErrorSet.has(item),
    );

    const errorHtmlChanged =
      current.errorHtmlChunks.some((item) => !prevHtmlSet.has(item)) &&
      current.errorHtmlChunks.length > 0;

    return {
      newInvalidFields,
      newAlertTexts,
      newErrorTexts,
      invalidFieldCountIncreased:
        current.invalidFields.length > previous.invalidFields.length,
      errorHtmlChanged,
      errorContainerCountIncreased:
        current.errorContainerCount > previous.errorContainerCount,
      domChanged: current.hash !== previous.hash,
    };
  }

  private buildDiffFailureMessage(
    diff: ReturnType<ExecutionEngine["diffSnapshots"]>,
    snapshot: ReactiveSnapshot,
  ): string {
    if (diff.newInvalidFields.length > 0) {
      return `Nuevos campos inválidos detectados: ${diff.newInvalidFields[0]}`;
    }
    if (diff.newErrorTexts.length > 0) {
      return `Nuevo mensaje de error detectado: ${diff.newErrorTexts[0]}`;
    }
    if (diff.newAlertTexts.length > 0) {
      return `Nueva alerta de error detectada: ${diff.newAlertTexts[0]}`;
    }
    if (diff.errorContainerCountIncreased) {
      return "Aparecieron nuevos contenedores de error visibles tras el submit.";
    }
    if (diff.invalidFieldCountIncreased && snapshot.invalidFields.length > 0) {
      return `Aumentó el número de campos inválidos (${snapshot.invalidFields.length}).`;
    }
    return "Cambio de estado de error detectado en la página.";
  }

  private isElementVisible(el: HTMLElement): boolean {
    const style = window.getComputedStyle(el);
    if (
      style.display === "none" ||
      style.visibility === "hidden" ||
      style.opacity === "0"
    ) {
      return false;
    }
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  private getElementLabel(el: HTMLElement): string {
    if (el instanceof HTMLInputElement || el instanceof HTMLSelectElement) {
      if (el.id) {
        const label = document.querySelector(`label[for="${el.id}"]`);
        if (label instanceof HTMLElement && label.innerText.trim()) {
          return label.innerText.trim();
        }
      }
      if (el.name) return el.name;
    }

    return el.getAttribute("aria-label") || el.id || el.tagName.toLowerCase();
  }

  private getValidationMessage(el: HTMLElement): string {
    const field = this.getElementLabel(el);
    if (
      el instanceof HTMLInputElement ||
      el instanceof HTMLSelectElement ||
      el instanceof HTMLTextAreaElement
    ) {
      const native = el.validationMessage?.trim();
      if (native) return `${field}: ${native}`;
    }
    return `Campo inválido: ${field}`;
  }

  private findVisibleErrorNodes(): Array<{ element: HTMLElement; text: string }> {
    const strongErrorSelectors = [
      "[data-error]",
      ".errormsg",
      ".help-error",
      ".field-error",
      ".form-error",
      ".error-message",
      ".error_text",
      ".invalid-feedback",
    ].join(",");

    const candidates = Array.from(
      document.querySelectorAll<HTMLElement>(
        [
          '[role="alert"]',
          '[role="alertdialog"]',
          '[aria-live="assertive"]',
          '[aria-live="polite"]',
          ".error",
          ".errors",
          ".field-error",
          ".form-error",
          ".invalid",
          ".errormsg",
          ".help-error",
          '[class*="error"]',
          '[class*="invalid"]',
        ].join(","),
      ),
    );

    const errorPattern =
      /(error|invalid|required|obligatorio|requerido|incorrect|must|debe|not valid|is required)/i;

    const found: Array<{ element: HTMLElement; text: string }> = [];
    for (const el of candidates) {
      if (!this.isElementVisible(el)) continue;
      const text = (el.innerText || "").replace(/\s+/g, " ").trim();
      if (!text || text.length < 5) continue;
      const isStrongErrorContainer = el.matches(strongErrorSelectors);
      if (isStrongErrorContainer || errorPattern.test(text)) {
        found.push({ element: el, text: text.slice(0, 180) });
      }
    }

    return found;
  }

  private getErrorHtmlSnippet(el: HTMLElement): string {
    const container =
      el.closest(
        '.error, .errors, .field-error, .form-error, .errormsg, [role="alert"], [aria-live]',
      ) || el;
    return (container.outerHTML || "").replace(/\s+/g, " ").trim().slice(0, 450);
  }

  private uniqueStrings(values: string[]): string[] {
    return [...new Set(values.filter(Boolean))];
  }

  private simpleHash(input: string): string {
    let hash = 5381;
    for (let i = 0; i < input.length; i++) {
      hash = (hash * 33) ^ input.charCodeAt(i);
    }
    return (hash >>> 0).toString(16);
  }

  private isReactiveSnapshot(value: unknown): value is ReactiveSnapshot {
    if (!value || typeof value !== "object") return false;
    const candidate = value as Partial<ReactiveSnapshot>;
    return (
      typeof candidate.hash === "string" &&
      Array.isArray(candidate.invalidFields) &&
      Array.isArray(candidate.alertTexts) &&
      Array.isArray(candidate.errorTexts)
    );
  }

  private wait(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
