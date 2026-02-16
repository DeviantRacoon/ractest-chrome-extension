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
}
