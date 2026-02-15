/**
 * Chrome Inspector Service
 * Handles communication with content scripts to activate/deactivate inspector
 */

import type { SelectorInfo, TestStep } from "../types";
import type {
  ContentToPopupMessage,
  PopupToContentMessage,
} from "../types/messages";

export class InspectorService {
  private isActive = false;
  private currentTabId: number | null = null;

  /**
   * Activate inspector mode in the current tab
   */
  public async activateInspector(profileId: string): Promise<void> {
    try {
      // Check if running as Chrome extension
      if (typeof chrome === "undefined" || !chrome.tabs) {
        console.warn("[Inspector Service] Not running as Chrome extension");
        return;
      }

      const [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });

      if (!tab.id) {
        throw new Error("No active tab found");
      }

      this.currentTabId = tab.id;

      // Wait for content script to be ready
      await this.waitForContentScript(tab.id);

      const message: PopupToContentMessage = {
        type: "ACTIVATE_INSPECTOR",
        profileId,
      };

      await chrome.tabs.sendMessage(tab.id, message);
      this.isActive = true;

      console.log("[Inspector Service] Activated for tab:", tab.id);
    } catch (error) {
      console.error("[Inspector Service] Failed to activate:", error);
      throw error;
    }
  }

  /**
   * Get the distilled DOM from the current tab
   */
  public async getDistilledDOM(
    _profileId: string,
    mode: "fast" | "normal" | "complex" = "normal",
  ): Promise<string> {
    try {
      // Check if running as Chrome extension
      if (typeof chrome === "undefined" || !chrome.tabs) {
        throw new Error("Not running as Chrome extension");
      }

      // Ensure we have a valid tab
      let tabId = this.currentTabId;
      if (!tabId) {
        const [tab] = await chrome.tabs.query({
          active: true,
          currentWindow: true,
        });
        if (!tab?.id) throw new Error("No active tab found");
        tabId = tab.id;
      }

      // Ensure content script is ready
      await this.waitForContentScript(tabId);

      const response = await chrome.tabs.sendMessage(tabId, {
        type: "GET_DISTILLED_DOM",
        mode,
      });

      if (!response.success) {
        throw new Error(response.error || "Failed to distill DOM");
      }

      return response.dom;
    } catch (error) {
      console.error("[Inspector Service] Failed to get distilled DOM:", error);
      throw error;
    }
  }

  /**
   * Execute a single test step in the content script
   */
  public async executeStep(step: TestStep): Promise<void> {
    try {
      // Check if running as Chrome extension
      if (typeof chrome === "undefined" || !chrome.tabs) {
        throw new Error("Not running as Chrome extension");
      }

      // Ensure we have a valid tab
      let tabId = this.currentTabId;
      if (!tabId) {
        const [tab] = await chrome.tabs.query({
          active: true,
          currentWindow: true,
        });
        if (!tab?.id) throw new Error("No active tab found");
        tabId = tab.id;
      }

      // Ensure content script is ready
      await this.waitForContentScript(tabId);

      const response = await chrome.tabs.sendMessage(tabId, {
        type: "EXECUTE_STEP",
        step,
      });

      if (!response.success) {
        throw new Error(response.error || "Failed to execute step");
      }
    } catch (error) {
      console.error("[Inspector Service] Failed to execute step:", error);
      throw error;
    }
  }

  /**
   * Pings the content script to ensure it's ready
   */
  private async waitForContentScript(tabId: number): Promise<void> {
    const maxRetries = 10;
    const interval = 500;

    for (let i = 0; i < maxRetries; i++) {
      try {
        await chrome.tabs.sendMessage(tabId, { type: "PING" });
        return;
      } catch (error) {
        // If first attempt fails, try to inject the script programmatically
        if (i === 0) {
          console.log(
            "[Inspector Service] Initial ping failed, attempting to inject content script...",
          );
          try {
            await chrome.scripting.executeScript({
              target: { tabId },
              files: ["content/content.js"],
            });
            console.log(
              "[Inspector Service] Content script injected programmatically",
            );
            // Wait a bit for script to initialize
            await new Promise((resolve) => setTimeout(resolve, 500));
            continue;
          } catch (injectionError) {
            console.error(
              "[Inspector Service] Failed to inject content script:",
              injectionError,
            );
          }
        }

        // Ignore error and retry
        console.log(
          `[Inspector Service] Waiting for content script... (${i + 1}/${maxRetries})`,
        );
        await new Promise((resolve) => setTimeout(resolve, interval));
      }
    }

    throw new Error("Content script not responding after multiple retries");
  }

  /**
   * Deactivate inspector mode
   */
  public async deactivateInspector(): Promise<void> {
    if (!this.currentTabId) {
      return;
    }

    // Check if running as Chrome extension
    if (typeof chrome === "undefined" || !chrome.tabs) {
      console.warn("[Inspector Service] Not running as Chrome extension");
      return;
    }

    try {
      const message: PopupToContentMessage = {
        type: "DEACTIVATE_INSPECTOR",
      };

      await chrome.tabs.sendMessage(this.currentTabId, message);
      this.isActive = false;
      this.currentTabId = null;

      console.log("[Inspector Service] Deactivated");
    } catch (error) {
      console.error("[Inspector Service] Failed to deactivate:", error);
    }
  }

  /**
   * Highlight an element on the page using a selector
   */
  public async highlightElement(selector: string): Promise<void> {
    // If no current tab ID, try to find the active tab
    let tabId = this.currentTabId;

    if (!tabId) {
      try {
        const [tab] = await chrome.tabs.query({
          active: true,
          currentWindow: true,
        });
        if (tab?.id) {
          tabId = tab.id;
          // We don't set this.currentTabId here to avoid inconsistent state
          // if the user hasn't explicitly activated the inspector
        }
      } catch (err) {
        console.warn("[Inspector Service] Failed to query active tab:", err);
      }
    }

    if (!tabId) {
      console.warn("[Inspector Service] No active tab to highlight element");
      return;
    }

    // Check if running as Chrome extension
    if (typeof chrome === "undefined" || !chrome.tabs) {
      console.warn("[Inspector Service] Not running as Chrome extension");
      return;
    }

    try {
      // Ensure content script is ready
      await this.waitForContentScript(tabId);

      const message: PopupToContentMessage = {
        type: "HIGHLIGHT_ELEMENT",
        selector,
      };

      await chrome.tabs.sendMessage(tabId, message);
    } catch (error) {
      console.error("[Inspector Service] Failed to highlight element:", error);
    }
  }

  private elementCapturedCallback: ((selector: SelectorInfo) => void) | null =
    null;
  private errorCapturedCallback: ((error: any) => void) | null = null;

  constructor() {
    // Set up single message listener in constructor
    // Only if running as Chrome extension (not as web app)
    if (typeof chrome !== "undefined" && chrome.runtime) {
      chrome.runtime.onMessage.addListener((message: ContentToPopupMessage) => {
        if (
          message.type === "ELEMENT_CAPTURED" &&
          this.elementCapturedCallback
        ) {
          this.elementCapturedCallback(message.payload);
        } else if (
          message.type === "CAPTURED_ERROR" &&
          this.errorCapturedCallback
        ) {
          this.errorCapturedCallback({
            subtype: message.subtype,
            payload: message.payload,
            timestamp: message.timestamp,
          });
        }
      });
    }
  }

  /**
   * Listen for messages from content script
   */
  public onElementCaptured(callback: (selector: SelectorInfo) => void): void {
    this.elementCapturedCallback = callback;
  }

  /**
   * Listen for captured errors
   */
  public onErrorCaptured(callback: (error: any) => void): void {
    this.errorCapturedCallback = callback;
  }

  /**
   * Check if inspector is currently active
   */
  public isInspectorActive(): boolean {
    return this.isActive;
  }
}

// Export singleton instance
export const inspectorService = new InspectorService();
