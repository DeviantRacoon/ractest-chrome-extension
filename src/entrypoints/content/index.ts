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

      default:
        console.warn("[RacTest Content Script] Unknown message type:", message);
        sendResponse({ success: false, error: "Unknown message type" });
    }

    return true; // Keep the message channel open for async response
  },
);

// Log when content script is loaded
console.log("[RacTest Content Script] Loaded and ready");

// Inject passive error monitor
injectErrorCapture();

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
  }
});
