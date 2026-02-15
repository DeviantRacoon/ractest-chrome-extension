import type { SelectorInfo, TestStep } from "../../commons/types";

/**
 * Domain Interfaces for RacTest Core
 * These interfaces define the contracts for the core business logic, ensuring independence from infrastructure.
 */

export interface IInspector {
  /**
   * Activates the inspector for a specific profile context
   */
  activateInspector(profileId: string): Promise<void>;

  /**
   * Deactivates the inspector
   */
  deactivateInspector(): Promise<void>;

  /**
   * Highlights an element on the active page
   */
  highlightElement(selector: string, message?: string): Promise<void>;

  /**
   * Gets a simplified/distilled DOM representation for AI consumption
   */
  getDistilledDOM(profileId: string): Promise<string>;

  /**
   * Executes a specific test step on the page
   */
  executeStep(step: TestStep): Promise<void>;

  /**
   * Registers a callback for when an element is captured by the user
   */
  onElementCaptured(callback: (info: SelectorInfo) => void): void;

  /**
   * Registers a callback for captured errors (passive monitoring)
   */
  onErrorCaptured(callback: (error: any) => void): void;
}

export interface ILLMProvider {
  /**
   * Generates a list of steps based on a prompt and context
   */
  generateSteps(
    prompt: string,
    context?: string,
    dom?: string,
    previousSteps?: TestStep[],
  ): Promise<TestStep[]>;
}

export interface IAgentLog {
  id: string;
  timestamp: number;
  type: "info" | "action" | "success" | "error" | "thinking";
  message: string;
}

export interface AgentConfig {
  maxSteps: number;
  stepDelayMs: number;
  readingMode: "fast" | "normal" | "complex";
}

export interface AgentRunReport {
  id: string;
  goal: string;
  status: "COMPLETED" | "FAILED" | "STOPPED";
  startTime: number;
  endTime: number;
  durationMs: number;
  stepsExecuted: number;
  steps: TestStep[];
  errors: {
    visual: string[];
    console: any[]; // Keeping any for now to avoid circular dependency with commons if strictly domain
    network: any[];
  };
}

export interface IAgent {
  /**
   * Starts the agent execution with a specific goal
   */
  start(goal: string, profileId: string): Promise<void>;

  /**
   * Stops the agent execution
   */
  stop(): void;

  /**
   * Registers a callback to receive agent logs
   */
  setLogCallback(callback: (log: IAgentLog) => void): void;

  /**
   * Checks if the agent is currently running
   */
  isRunning(): boolean;
}

export interface IDOMMarker {
  /**
   * Marks interactive elements on the page with unique IDs
   */
  markInteractiveElements(
    profileId: string,
    mode?: "fast" | "normal" | "complex",
  ): Promise<void>;

  /**
   * Unmarks elements (cleans up)
   */
  unmarkInteractiveElements(profileId: string): Promise<void>;

  /**
   * Gets the semantic context of marked elements
   */
  getMarkedContext(profileId: string): Promise<string>;

  /**
   * detects visual errors on the page
   */
  detectVisualErrors(): Promise<string[]>;

  /**
   * Executes an action on a marked element
   */
  executeActionOnMarkedElement(
    profileId: string,
    elementId: number,
    action: "CLICK" | "TYPE" | "SELECT" | "HOVER" | "ASSERT",
    value?: string,
  ): Promise<void>;

  /**
   * Waits for the DOM to be stable (no mutations) for a certain duration.
   * @param timeoutMs Max time to wait in ms before returning anyway.
   */
  waitForDOMStability(timeoutMs?: number): Promise<void>;
}
