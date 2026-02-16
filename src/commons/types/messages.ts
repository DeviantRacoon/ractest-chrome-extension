// Chrome Extension Message Types for Communication
import type { SelectorInfo, StepExecutionResult, TestStep } from "./index";

/**
 * Messages sent from popup to content script
 */
export type PopupToContentMessage =
  | {
      type: "ACTIVATE_INSPECTOR";
      profileId: string;
    }
  | {
      type: "DEACTIVATE_INSPECTOR";
    }
  | {
      type: "HIGHLIGHT_ELEMENT";
      selector: string;
    }
  | {
      type: "PING";
    }
  | {
      type: "EXECUTE_RECIPE";
      recipeId: string;
      steps: TestStep[];
    }
  | {
      type: "EXECUTE_STEP";
      step: TestStep;
    }
  | {
      type: "PREPARE_REACTIVE_OBSERVATION";
    }
  | {
      type: "CHECK_REACTIVE_FAILURES";
      stepAction?: TestStep["action"];
      stepMessage?: string;
      previousSnapshot?: unknown;
    }
  | {
      type: "STOP_EXECUTION";
    }
  | {
      type: "GET_DISTILLED_DOM";
      mode?: "fast" | "normal" | "complex";
    }
  | {
      type: "GET_AUTOMATION_FEEDBACK";
    };

/**
 * Messages sent from content script to popup
 */
export type ContentToPopupMessage =
  | {
      type: "INSPECTOR_ACTIVATED";
    }
  | {
      type: "INSPECTOR_DEACTIVATED";
    }
  | {
      type: "ELEMENT_CAPTURED";
      payload: SelectorInfo;
    }
  | {
      type: "INSPECTOR_ERROR";
      error: string;
    }
  | {
      type: "STEP_RESULT";
      result: StepExecutionResult;
    }
  | {
      type: "EXECUTION_COMPLETE";
      recipeId: string;
      results: StepExecutionResult[];
    }
  | {
      type: "EXECUTION_FAILED";
      recipeId: string;
      error: string;
      results: StepExecutionResult[];
    }
  | {
      type: "CAPTURED_ERROR";
      subtype: string;
      payload: any;
      timestamp: number;
    }
  | {
      type: "CONSOLE_LOG";
      logEntry: any; // Using 'any' to avoid circular dependency with ConsoleLogEntry which is in types/index.ts
    };

/**
 * Combined message type
 */
export type ChromeMessage = PopupToContentMessage | ContentToPopupMessage;
