/**
 * Inspector Module for RacTest
 * Manages the DOM inspection mode and element capture
 */

import type { ContentToPopupMessage } from "../../../commons/types/messages";
import { OverlaySystem } from "../components/OverlaySystem";
import { generateSelector, getBestSelector } from "../utils/selector";
import type { CaptureAction, CaptureStepDraft } from "../../../commons/types";

interface SelectOptionPair {
  label: string;
  value: string;
}

export class Inspector {
  private overlay: OverlaySystem;
  private isActive = false;
  private defaultDelay = 500;

  constructor() {
    this.overlay = new OverlaySystem();
    this.setupExitHandlers();
  }

  /**
   * Activate inspector mode
   */
  public activate(profileId: string): void {
    if (this.isActive) return;

    this.isActive = true;

    // Load settings and apply highlight color
    chrome.storage.local.get(["ractest_settings"], (result) => {
      const settings = result.ractest_settings as any;
      if (typeof settings?.defaultDelay === "number") {
        this.defaultDelay = settings.defaultDelay;
      }
      if (settings && settings.highlightColor) {
        this.overlay.setHighlightColor(settings.highlightColor);
      }
      this.overlay.activate();
    });

    // Listen for setting changes to update highlight color dynamically
    chrome.storage.onChanged.addListener(this.handleStorageChange);

    this.attachEventListeners();

    // Notify popup that inspector is active
    this.sendMessage({
      type: "INSPECTOR_ACTIVATED",
    });

    console.log("[RacTest] Inspector activated for profile:", profileId);
  }

  /**
   * Deactivate inspector mode
   */
  public deactivate(): void {
    if (!this.isActive) return;

    this.isActive = false;
    this.overlay.deactivate();
    this.removeEventListeners();
    chrome.storage.onChanged.removeListener(this.handleStorageChange);

    // Notify popup that inspector is deactivated
    this.sendMessage({
      type: "INSPECTOR_DEACTIVATED",
    });

    console.log("[RacTest] Inspector deactivated");
  }

  /**
   * Check if inspector is active
   */
  public isInspectorActive(): boolean {
    return this.isActive;
  }

  /**
  /**
   * Highlight a specific element using a selector
   */
  public highlightElementBySelector(selector: string): void {
    try {
      let element: HTMLElement | null = null;

      // Check if selector looks like XPath (starts with // or contains /)
      if (selector.startsWith("//") || selector.startsWith("(")) {
        try {
          const result = document.evaluate(
            selector,
            document,
            null,
            XPathResult.FIRST_ORDERED_NODE_TYPE,
            null,
          );
          element = result.singleNodeValue as HTMLElement;
        } catch (e) {
          console.warn("[RacTest] Invalid XPath:", selector, e);
        }
      } else {
        try {
          element = document.querySelector(selector) as HTMLElement;
        } catch (e) {
          console.warn("[RacTest] Invalid CSS selector:", selector, e);
        }
      }

      if (element) {
        this.overlay.highlightElement(element, selector, 2000);

        // Scroll element into view
        element.scrollIntoView({ behavior: "smooth", block: "center" });
      } else {
        console.warn("[RacTest] Element not found for selector:", selector);
      }
    } catch (error) {
      console.error("[RacTest] Failed to highlight element:", error);
    }
  }

  private attachEventListeners(): void {
    document.addEventListener("mousemove", this.handleMouseMove, true);
    document.addEventListener("click", this.handleClick, true);
    document.addEventListener("keydown", this.handleKeyDown, true);
  }

  private removeEventListeners(): void {
    document.removeEventListener("mousemove", this.handleMouseMove, true);
    document.removeEventListener("click", this.handleClick, true);
    document.removeEventListener("keydown", this.handleKeyDown, true);
  }

  private handleMouseMove = (event: MouseEvent): void => {
    if (!this.isActive) return;

    const target = event.target as HTMLElement;

    // Ignore RacTest's own elements
    if (this.isRacTestElement(target)) {
      this.overlay.hide();
      return;
    }

    // Highlight the element
    const selectorInfo = generateSelector(target);
    const bestSelector = getBestSelector(selectorInfo);

    this.overlay.highlightElement(target, bestSelector);
  };

  private handleClick = (event: MouseEvent): void => {
    if (!this.isActive) return;

    const target = event.target as HTMLElement;

    // Ignore RacTest's own elements
    if (this.isRacTestElement(target)) {
      return;
    }

    // Prevent default action
    event.preventDefault();
    event.stopPropagation();

    // Generate selector info
    const selectorInfo = generateSelector(target);

    const defaultAction = this.getDefaultAction(target);
    const bestSelector = getBestSelector(selectorInfo);

    this.overlay.showCaptureMenu({
      x: event.clientX,
      y: event.clientY,
      defaultAction,
      defaultValue:
        defaultAction === "SELECT"
          ? this.getDefaultSelectValue(target)
          : undefined,
      selectOptions:
        defaultAction === "SELECT" ? this.getSelectOptions(target) : [],
      defaultDelay: this.defaultDelay,
      onSave: (stepDraft: CaptureStepDraft) => {
        this.overlay.showCaptureConfirmation();
        this.sendMessage({
          type: "ELEMENT_CAPTURED",
          payload: {
            selectorInfo,
            stepDraft,
            source: "quick_menu",
          },
        });
        console.log("[RacTest] Element captured with menu:", {
          selector: bestSelector,
          stepDraft,
        });
      },
      onCancel: () => {
        console.log("[RacTest] Capture cancelled from menu");
      },
    });

    // Optionally deactivate after capture
    // this.deactivate();
  };

  private handleKeyDown = (event: KeyboardEvent): void => {
    if (!this.isActive) return;

    // Exit on ESC key
    if (event.key === "Escape") {
      event.preventDefault();
      if (this.overlay.isCaptureMenuOpen()) {
        this.overlay.hideCaptureMenu();
        return;
      }
      this.deactivate();
    }
  };

  private setupExitHandlers(): void {
    this.overlay.onExitClick(() => {
      this.deactivate();
    });
  }

  private isRacTestElement(element: HTMLElement): boolean {
    if (element.closest('[id^="ractest-"]')) {
      return true;
    }

    let current: HTMLElement | null = element;
    while (current) {
      for (const className of Array.from(current.classList)) {
        if (className.startsWith("ractest-") && className !== "ractest-inspecting") {
          return true;
        }
      }
      current = current.parentElement;
    }

    return false;
  }

  private handleStorageChange = (
    changes: { [key: string]: chrome.storage.StorageChange },
    areaName: string,
  ) => {
    if (areaName === "local" && changes.ractest_settings) {
      const newSettings = changes.ractest_settings.newValue as any;
      if (typeof newSettings?.defaultDelay === "number") {
        this.defaultDelay = newSettings.defaultDelay;
      }
      if (newSettings && newSettings.highlightColor) {
        this.overlay.setHighlightColor(newSettings.highlightColor);
      }
    }
  };

  private getDefaultAction(target: HTMLElement): CaptureAction {
    const tagName = target.tagName.toLowerCase();
    if (target instanceof HTMLSelectElement || tagName === "select") {
      return "SELECT";
    }
    if (target instanceof HTMLTextAreaElement || tagName === "textarea") {
      return "TYPE";
    }
    if (target instanceof HTMLInputElement || tagName === "input") {
      const input = target as HTMLInputElement;
      const inputType = (input.type || "").toLowerCase();
      if (inputType === "checkbox" || inputType === "radio") {
        return input.checked ? "UNCHECK" : "CHECK";
      }
      if (
        inputType === "text" ||
        inputType === "email" ||
        inputType === "password" ||
        inputType === "search" ||
        inputType === "tel" ||
        inputType === "url" ||
        inputType === "number"
      ) {
        return "TYPE";
      }
    }
    return "CLICK";
  }

  private getSelectElement(target: HTMLElement): HTMLSelectElement | null {
    if (target instanceof HTMLSelectElement) return target;
    const fromTagName =
      target.tagName.toLowerCase() === "select"
        ? (target as HTMLSelectElement)
        : null;
    if (fromTagName) return fromTagName;
    return target.closest("select");
  }

  private getDefaultSelectValue(target: HTMLElement): string {
    const select = this.getSelectElement(target);
    return select?.value ?? "";
  }

  private getSelectOptions(target: HTMLElement): SelectOptionPair[] {
    const select = this.getSelectElement(target);
    if (!select) return [];

    return Array.from(select.options).map((option) => ({
      label: option.textContent?.trim() || option.label || "(empty label)",
      value: option.value ?? "",
    }));
  }

  private sendMessage(message: ContentToPopupMessage): void {
    try {
      chrome.runtime.sendMessage(message);
    } catch (error) {
      console.error("[RacTest] Failed to send message:", error);
    }
  }
}
