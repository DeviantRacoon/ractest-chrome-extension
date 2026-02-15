/**
 * Background History Manager
 * Listens for execution events and persists them to storage.
 * Ensures history is saved even if the popup is closed.
 */

import { storageService } from "../../../commons/lib/storage";
import type {
  RecipeExecutionResult,
  StepExecutionResult,
} from "../../../commons/types";
import type { ContentToPopupMessage } from "../../../commons/types/messages";

export function initializeHistoryManager() {
  chrome.runtime.onMessage.addListener(
    (message: ContentToPopupMessage, _sender, sendResponse) => {
      switch (message.type) {
        case "EXECUTION_COMPLETE":
          console.log(
            "[Background] Received EXECUTION_COMPLETE, saving to history",
          );
          // Return true to indicate async response (keeps SW alive)
          handleExecutionComplete(message.recipeId, message.results).then(
            () => {
              sendResponse({ success: true });
            },
          );
          return true;

        case "EXECUTION_FAILED":
          console.log(
            "[Background] Received EXECUTION_FAILED, saving to history",
          );
          handleExecutionFailed(
            message.recipeId,
            message.error,
            message.results,
          ).then(() => {
            sendResponse({ success: true });
          });
          return true;
      }
      // Return false for other messages
      return false;
    },
  );
}

async function handleExecutionComplete(
  recipeId: string,
  results: StepExecutionResult[],
) {
  const completeResult: RecipeExecutionResult = {
    id: crypto.randomUUID(),
    recipeId,
    recipeName: "Flujo Desconocido",
    startTime: results[0]?.timestamp || Date.now(),
    endTime: Date.now(),
    status: "completed",
    steps: results,
  };
  await enrichAndSaveHistory(completeResult);
}

async function handleExecutionFailed(
  recipeId: string,
  error: string,
  results: StepExecutionResult[],
) {
  const failedResult: RecipeExecutionResult = {
    id: crypto.randomUUID(),
    recipeId,
    recipeName: "Flujo Desconocido", // Placeholder
    startTime: results[0]?.timestamp || Date.now(),
    endTime: Date.now(),
    status: "failed",
    steps: results,
    errorMessage: error,
  };
  await enrichAndSaveHistory(failedResult);
}

async function enrichAndSaveHistory(result: RecipeExecutionResult) {
  try {
    const profile = await storageService.getProfile(result.recipeId);
    if (profile) {
      result.recipeName = profile.name;
    }
    await storageService.addToHistory(result);
    console.log("[Background] History saved successfully");
  } catch (e) {
    console.error("[Background] Failed to save history:", e);
  }
}
