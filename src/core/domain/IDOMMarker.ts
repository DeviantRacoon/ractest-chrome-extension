export interface IDOMMarker {
  /**
   * Marks interactive elements on the page with unique IDs and visual badges.
   * Returns a map of ID -> Element info (or just confirms success).
   */
  markInteractiveElements(
    profileId: string,
    mode?: "fast" | "normal" | "complex",
  ): Promise<void>;

  /**
   * Retrieves the current context string (distilled DOM)
   */
  getMarkedContext(profileId: string): Promise<string>;

  /**
   * Scans the page for visual error indications (toasts, alert classes)
   */
  detectVisualErrors(): Promise<string[]>;

  /**
   * Captures condensed outcome signals from the current page state.
   */
  getOutcomeSignals(): Promise<string[]>;

  /**
   * Returns structured visual feedback signals for AI classification.
   */
  getVisualSignals(): Promise<
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
  >;

  /**
   * Removes all markers from the page.
   */
  unmarkInteractiveElements(profileId: string): Promise<void>;

  /**
   * Executes an action on a specific marked element by its injected ID.
   */
  executeActionOnMarkedElement(
    profileId: string,
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
  ): Promise<void>;

  /**
   * Waits for the DOM to stabilize for a maximum timeout.
   */
  waitForDOMStability(timeoutMs?: number): Promise<void>;
}
