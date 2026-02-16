/**
 * Content Script Entry Point for RacTest
 * Injected into all web pages to enable inspector and execution functionality
 */

import type { PopupToContentMessage } from "../../commons/types/messages";
import { ExecutionEngine } from "../../modules/execution/services/ExecutionEngine";
import { Inspector } from "../../modules/inspector/services/Inspector";
import { injectErrorCapture } from "../../modules/monitoring/services/ErrorCapture";

// Create singleton instances
const inspector = new Inspector();
let executionEngine: ExecutionEngine | null = null;

function collectAutomationFeedback() {
  const selectors = [
    '[role="alert"]',
    '[role="status"]',
    '[aria-live]',
    ".alert",
    ".alert-danger",
    ".toast",
    ".notification",
    ".error",
    ".errors",
    ".invalid-feedback",
    '[class*="error"]',
    '[class*="danger"]',
    '[class*="invalid"]',
  ].join(",");

  const isVisible = (el: Element): boolean => {
    const style = window.getComputedStyle(el as HTMLElement);
    if (
      style.display === "none" ||
      style.visibility === "hidden" ||
      style.opacity === "0"
    ) {
      return false;
    }
    const rect = (el as HTMLElement).getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  };

  const feedbackItems = Array.from(document.querySelectorAll(selectors))
    .filter((el) => isVisible(el))
    .slice(0, 60)
    .map((el) => {
      const htmlEl = el as HTMLElement;
      const style = window.getComputedStyle(htmlEl);
      const text = (htmlEl.innerText || htmlEl.textContent || "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 280);
      const className = String(htmlEl.className || "").slice(0, 200);
      const role = String(htmlEl.getAttribute("role") || "");
      const ariaLive = String(htmlEl.getAttribute("aria-live") || "");

      return {
        text,
        className,
        role,
        ariaLive,
        color: style.color || "",
        backgroundColor: style.backgroundColor || "",
        borderColor: style.borderColor || "",
      };
    })
    .filter((item) => item.text || item.className || item.role);

  const invalidFields = Array.from(
    document.querySelectorAll(
      'input:invalid, select:invalid, textarea:invalid, [aria-invalid="true"]',
    ),
  )
    .filter((el) => isVisible(el))
    .slice(0, 30)
    .map((el) => {
      const htmlEl = el as HTMLElement;
      const label =
        htmlEl.getAttribute("aria-label") ||
        htmlEl.getAttribute("name") ||
        htmlEl.getAttribute("id") ||
        htmlEl.tagName.toLowerCase();
      return String(label);
    });

  return {
    url: location.href,
    title: document.title,
    feedbackItems,
    invalidFields,
  };
}

/**
 * Listen for messages from popup
 */
chrome.runtime.onMessage.addListener(
  (
    message: PopupToContentMessage,
    _sender: chrome.runtime.MessageSender,
    sendResponse: (response: any) => void,
  ) => {
    console.log("[RacTest Content Script] Received message:", message);

    switch (message.type) {
      case "ACTIVATE_INSPECTOR":
        inspector.activate(message.profileId);
        sendResponse({ success: true });
        break;

      case "DEACTIVATE_INSPECTOR":
        inspector.deactivate();
        sendResponse({ success: true });
        break;

      case "HIGHLIGHT_ELEMENT":
        inspector.highlightElementBySelector(message.selector);
        sendResponse({ success: true });
        break;

      case "PING":
        sendResponse({ success: true });
        break;

      case "EXECUTE_RECIPE":
        // Deactivate inspector if active
        inspector.deactivate();
        // Create a new engine and run
        executionEngine = new ExecutionEngine();
        executionEngine.execute(message.recipeId, message.steps);
        sendResponse({ success: true });
        break;

      case "EXECUTE_STEP":
        // This is the new persistent execution mode
        inspector.deactivate();
        if (!executionEngine) {
          executionEngine = new ExecutionEngine();
        }
        // Run single step and await result
        executionEngine
          .executeSingleStep(message.step)
          .then((result) => sendResponse({ success: true, result }))
          .catch((error) =>
            sendResponse({ success: false, error: String(error) }),
          );
        return true; // Async response

      case "PREPARE_REACTIVE_OBSERVATION":
        if (!executionEngine) {
          executionEngine = new ExecutionEngine();
        }
        sendResponse({
          success: true,
          snapshot: executionEngine.prepareReactiveObservation(),
        });
        break;

      case "CHECK_REACTIVE_FAILURES":
        if (!executionEngine) {
          executionEngine = new ExecutionEngine();
        }
        sendResponse({
          success: true,
          signal: executionEngine.checkReactiveFailure(
            message.stepAction,
            message.stepMessage,
            message.previousSnapshot,
          ),
        });
        break;

      case "STOP_EXECUTION":
        if (executionEngine) {
          executionEngine.stop();
          executionEngine = null;
        }
        sendResponse({ success: true });
        break;

      case "GET_DISTILLED_DOM":
        import("../../modules/ai-assistant/services/DOMDistiller").then(
          ({ domDistiller }) => {
            const dom = domDistiller.distill(message.mode);
            sendResponse({ success: true, dom });
          },
        );
        return true; // Async response

      case "GET_AUTOMATION_FEEDBACK":
        sendResponse({ success: true, feedback: collectAutomationFeedback() });
        break;

      default:
        console.warn("[RacTest Content Script] Unknown message type:", message);
        sendResponse({ success: false, error: "Unknown message type" });
    }

    return true; // Keep the message channel open for async response
  },
);

// Log when content script is loaded
console.log("[RacTest Content Script] Loaded and ready");

// Inject passive error monitor via background (MAIN world, CSP-safe)
injectErrorCapture();
// Ensure full console interceptor is available for agent/autopilot context
chrome.runtime.sendMessage({ type: "INJECT_LOGGER" }).catch(() => {});

// Listen for messages from the injected monitor script
window.addEventListener("message", (event) => {
  // We only accept messages from ourselves
  if (event.source !== window) return;

  if (event.data.type === "RAC_CAPTURED_ERROR") {
    const { subtype, payload, timestamp } = event.data;
    // Forward to background/popup
    chrome.runtime.sendMessage({
      type: "CAPTURED_ERROR",
      subtype,
      payload,
      timestamp,
    });
    return;
  }

  if (event.data?.source === "RACTEST_CONSOLE_LOG") {
    chrome.runtime.sendMessage({
      type: "CAPTURED_ERROR",
      subtype: "CONSOLE",
      payload: event.data.payload,
      timestamp: Date.now(),
    });
  }
});
