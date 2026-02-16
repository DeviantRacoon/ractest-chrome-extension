import type { IDOMMarker } from "../../../core/domain/IDOMMarker";

// Helper to get active tab (shared with inspectorService usually, but simplified here)
async function getActiveTabId(): Promise<number | null> {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  return tabs[0]?.id || null;
}

export class ChromeDOMMarker implements IDOMMarker {
  async markInteractiveElements(
    _profileId: string,
    mode: "fast" | "normal" | "complex" = "normal",
  ): Promise<void> {
    const tabId = await getActiveTabId();
    if (!tabId) throw new Error("No active tab found");

    // Check if script is already injected to avoid redundant execution
    const checkResults = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        // @ts-ignore
        return typeof window.RAC_SOM !== "undefined";
      },
    });

    const isInjected = checkResults[0]?.result;

    if (!isInjected) {
      // Inject the script file first to ensure functions exist
      await chrome.scripting.executeScript({
        target: { tabId },
        files: ["content/som-content.js"], // We need to make sure this is copied to build!
      });
    }

    // Execute the marking function
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: (m) => {
        // @ts-ignore
        if (typeof window.RAC_SOM === "undefined") {
          return { success: false, error: "RAC_SOM is undefined" };
        }
        // @ts-ignore
        if (window.RAC_SOM && window.RAC_SOM.markElements) {
          // @ts-ignore
          const count = window.RAC_SOM.markElements(m);
          return { success: true, count };
        }
        return { success: false, error: "markElements function missing" };
      },
      args: [mode],
    });

    const result = results[0]?.result;

    if (!result?.success) {
      throw new Error(`Failed to mark elements: ${result?.error}`);
    }
  }

  async unmarkInteractiveElements(_profileId: string): Promise<void> {
    const tabId = await getActiveTabId();
    if (!tabId) return;

    await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        // @ts-ignore
        if (window.RAC_SOM && window.RAC_SOM.unmarkElements) {
          // @ts-ignore
          window.RAC_SOM.unmarkElements();
        }
      },
    });
  }

  async executeActionOnMarkedElement(
    _profileId: string,
    elementId: number,
    action:
      | "CLICK"
      | "TYPE"
      | "SELECT"
      | "CHECK"
      | "UNCHECK"
      | "HOVER"
      | "ASSERT",
    value?: string,
  ): Promise<void> {
    const tabId = await getActiveTabId();
    if (!tabId) throw new Error("No active tab found");

    await chrome.scripting.executeScript({
      target: { tabId },
      func: (id, act, val) => {
        // @ts-ignore
        if (window.RAC_SOM && window.RAC_SOM.executeAction) {
          // @ts-ignore
          window.RAC_SOM.executeAction(id, act, val);
        } else {
          throw new Error("RAC_SOM not initialized");
        }
      },
      args: [elementId, action, value ?? null], // Ensure value is not undefined
    });
  }

  async getMarkedContext(_profileId: string): Promise<string> {
    const tabId = await getActiveTabId();
    if (!tabId) return "";

    const result = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        // @ts-ignore
        if (typeof window.RAC_SOM === "undefined")
          return "ERROR: RAC_SOM undefined";
        // @ts-ignore
        if (window.RAC_SOM && window.RAC_SOM.getMarkedTree) {
          // @ts-ignore
          return window.RAC_SOM.getMarkedTree();
        }
        return "ERROR: getMarkedTree missing";
      },
    });

    const context = result[0]?.result || "";
    if (context.startsWith("ERROR")) {
      console.error("DEBUG: Context retrieval failed:", context);
    }
    return context;
  }

  async detectVisualErrors(): Promise<string[]> {
    const tabId = await getActiveTabId();
    if (!tabId) return [];

    const result = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        // @ts-ignore
        if (window.RAC_SOM && window.RAC_SOM.scanForErrors) {
          // @ts-ignore
          return window.RAC_SOM.scanForErrors();
        }
        return [];
      },
    });

    return result[0]?.result || [];
  }

  async getOutcomeSignals(): Promise<string[]> {
    const tabId = await getActiveTabId();
    if (!tabId) return [];

    const result = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        // @ts-ignore
        if (window.RAC_SOM && window.RAC_SOM.getOutcomeSignals) {
          // @ts-ignore
          return window.RAC_SOM.getOutcomeSignals();
        }
        return [];
      },
    });

    return result[0]?.result || [];
  }

  async getVisualSignals(): Promise<
    Array<{
      text: string;
      role: string;
      className: string;
      color: string;
      backgroundColor: string;
      borderColor: string;
      ariaLive: string;
      toneHint: "success" | "error" | "warning" | "info" | "neutral";
    }>
  > {
    const tabId = await getActiveTabId();
    if (!tabId) return [];

    const result = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        // @ts-ignore
        if (window.RAC_SOM && window.RAC_SOM.getVisualSignals) {
          // @ts-ignore
          return window.RAC_SOM.getVisualSignals();
        }
        return [];
      },
    });

    return result[0]?.result || [];
  }

  async waitForDOMStability(timeoutMs: number = 2000): Promise<void> {
    const tabId = await getActiveTabId();
    if (!tabId) return;

    await chrome.scripting.executeScript({
      target: { tabId },
      func: (t) => {
        // @ts-ignore
        if (window.RAC_SOM && window.RAC_SOM.waitForDOMStability) {
          // @ts-ignore
          return window.RAC_SOM.waitForDOMStability(t);
        }
        // Fallback if not updated yet
        return new Promise((r) => setTimeout(r, 1000));
      },
      args: [timeoutMs],
    });
  }
}
