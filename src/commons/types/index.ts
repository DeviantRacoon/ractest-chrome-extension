// Core Types for RacTest Chrome Extension

/**
 * Represents a complete test profile (recipe)
 */
export interface TestProfile {
  id: string;
  name: string;
  url: string;
  steps: TestStep[];
  createdAt: number;
  updatedAt: number;
}

/**
 * Individual step in a test profile
 */
export interface TestStep {
  id: string;
  action: ActionType;
  selector: string;
  targetId?: number; // For Set-of-Marks
  value?: string;
  uniqueText?: boolean;
  useFakeData?: boolean;
  fakeDataType?:
    | "name"
    | "firstName"
    | "lastName"
    | "email"
    | "username"
    | "password"
    | "phone"
    | "address"
    | "city"
    | "state"
    | "zipCode"
    | "country"
    | "company"
    | "jobTitle"
    | "url"
    | "date"
    | "time"
    | "datetime"
    | "number"
    | "price"
    | "uuid"
    | "color"
    | "lorem";
  delay: number; // milliseconds
  order: number;
  thought?: string; // Agent's reasoning for this step (CoT)
}

export type FakeDataType =
  | "name"
  | "firstName"
  | "lastName"
  | "email"
  | "username"
  | "password"
  | "phone"
  | "address"
  | "city"
  | "state"
  | "zipCode"
  | "country"
  | "company"
  | "jobTitle"
  | "url"
  | "date"
  | "time"
  | "datetime"
  | "number"
  | "price"
  | "uuid"
  | "color"
  | "lorem";

/**
 * Supported action types
 */
export type ActionType =
  | "CLICK"
  | "TYPE"
  | "SELECT"
  | "CHECK"
  | "UNCHECK"
  | "DIVIDER"
  | "ASSERT"
  | "FINISH";

/**
 * Information captured from DOM element
 */
export interface SelectorInfo {
  testId?: string; // data-testid attribute
  id?: string; // id attribute
  name?: string; // name attribute
  ariaLabel?: string; // aria-label attribute
  dataType?: string; // Support for data-type attribute (common in builders)
  cssSelector?: string; // generated CSS selector
  xpath?: string; // generated XPath
  tagName: string; // HTML tag name
  text?: string; // visible text content
}

/**
 * Message types for communication between popup, background, and content scripts
 */
export type MessageType =
  | "ACTIVATE_INSPECTOR"
  | "DEACTIVATE_INSPECTOR"
  | "ELEMENT_SELECTED"
  | "EXECUTE_RECIPE"
  | "EXECUTE_RECIPE"
  | "EXECUTE_STEP"
  | "EXECUTION_STATUS"
  | "HIGHLIGHT_ELEMENT";

/**
 * Generic message structure
 */
export interface ChromeMessage<T = unknown> {
  type: MessageType;
  payload?: T;
}

/**
 * Execution result for a single step
 */
export interface StepExecutionResult {
  stepId: string;
  status: "success" | "error" | "skipped";
  message?: string;
  timestamp: number;
  duration?: number;
  error?: string;
}

export interface AutopilotCycleTelemetry {
  cycle: number;
  startedAt: number;
  durationMs: number;
  adaptiveMode: "fast" | "normal" | "complex";
  contextChars: number;
  domUnchanged: boolean;
  unchangedCycles: number;
  waitMs: number;
  markMs: number;
  contextMs: number;
  visualScanMs: number;
  planMs: number;
  actMs: number;
  verifyMs: number;
  replanned: boolean;
  replanReason?: string;
  plannedSteps: number;
  plannedIndex: number;
  stepAction?: string;
  stepTargetId?: number;
  outcome: "executed" | "finish" | "retry" | "failed" | "stopped" | "skipped";
}

export interface AutopilotTelemetrySummary {
  schemaVersion: 1;
  runStartedAt: number;
  runEndedAt: number;
  durationMs: number;
  cycles: number;
  stepsExecuted: number;
  replans: number;
  retries: number;
  domUnchangedCycles: number;
  llmPlanCalls: number;
  llmPlanMsTotal: number;
  llmVisualCalls: number;
  llmVisualMsTotal: number;
  llmOutcomeCalls: number;
  llmOutcomeMsTotal: number;
  observeMsTotal: number;
  actMsTotal: number;
  verifyMsTotal: number;
  avgCycleMs: number;
  maxCycleMs: number;
  replanReasons: Record<string, number>;
}

export interface AutopilotTelemetry {
  summary: AutopilotTelemetrySummary;
  cycles: AutopilotCycleTelemetry[];
}

/**
 * Overall execution result for a recipe
 */
export interface RecipeExecutionResult {
  id: string;
  recipeId: string;
  recipeName: string;
  startTime: number;
  duration?: number;
  endTime?: number;
  status: "running" | "completed" | "failed" | "cancelled";
  steps: StepExecutionResult[];
  consoleLogs?: ConsoleLogEntry[];
  errorMessage?: string;
  failureSignal?: FailureSignal;
  autopilotTelemetry?: AutopilotTelemetry;
}

/**
 * Storage keys for chrome.storage.local
 */
export const StorageKeys = {
  PROFILES: "ractest_profiles",
  HISTORY: "ractest_history",
  SETTINGS: "ractest_settings",
} as const;

export type AppLanguage = "en" | "es";
export type AppLanguagePreference = AppLanguage | "auto";

/**
 * User settings
 */
export interface UserSettings {
  defaultDelay: number; // default delay in ms
  theme: "dark" | "light"; // theme preference (future)
  language: AppLanguagePreference; // UI language preference
  highlightColor: string; // inspector highlight color
  notificationsEnabled: boolean; // show browser notifications
  enableAiForTesting?: boolean; // Enable AI assistance during test execution
  openRouterApiKey?: string; // API Key for AI features
  aiModel?: string; // Selected AI Model
  aiMaxTokens?: number; // Max tokens to generate
  agentMaxSteps?: number; // Max steps for AI Agent loop
  readingMode?: "fast" | "normal" | "complex"; // DOM reading strategy
  agentMode?: "strict_fail_fast" | "balanced"; // Agent error handling mode
  maxRetriesNonCritical?: number; // retries for non critical steps
}

export type LogLevel = "info" | "warn" | "error" | "log" | "debug";

export interface ConsoleLogEntry {
  timestamp: number;
  level: LogLevel;
  message: string;
  stack?: string;
}

export type CapturedErrorSubtype =
  | "CONSOLE"
  | "WINDOW"
  | "PROMISE"
  | "NETWORK"
  | "FORM_VALIDATION";

export interface FailureSignal {
  subtype: CapturedErrorSubtype;
  message: string;
  timestamp: number;
  payload?: unknown;
}
