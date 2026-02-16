/**
 * Requests background to inject error monitor in MAIN world.
 * Avoids inline script injection blocked by strict page CSP.
 */
export async function injectErrorCapture(): Promise<void> {
  if (typeof chrome === "undefined" || !chrome.runtime?.sendMessage) return;
  try {
    await chrome.runtime.sendMessage({ type: "INJECT_ERROR_MONITOR" });
  } catch (error) {
    console.error("[RacTest] Failed to request error monitor injection:", error);
  }
}
