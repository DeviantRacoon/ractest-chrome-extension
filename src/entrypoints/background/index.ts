import {
  injectConsoleInterceptor,
  injectErrorMonitor,
} from "../../core/infrastructure/chrome/ScriptInjector";
import { initializeHistoryManager } from "../../modules/history/services/BackgroundHistoryManager";

// Open Side Panel when clicking the extension icon
chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((error) => console.error(error));

// Initialize history persistence
initializeHistoryManager();

// Listen for Logger Injection requests
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "INJECT_LOGGER" && sender.tab?.id) {
    injectConsoleInterceptor(sender.tab.id);
    sendResponse({ success: true });
    return;
  }

  if (message.type === "INJECT_ERROR_MONITOR" && sender.tab?.id) {
    injectErrorMonitor(sender.tab.id);
    sendResponse({ success: true });
  }
});

console.log("[RacTest] Background service worker loaded");
