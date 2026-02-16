/**
 * Overlay System for RacTest Inspector
 * Creates visual feedback for element inspection
 */

const OVERLAY_ID = "ractest-inspector-overlay";
const TOOLTIP_ID = "ractest-inspector-tooltip";
const EXIT_BUTTON_ID = "ractest-exit-inspector";

export class OverlaySystem {
  private overlay: HTMLDivElement | null = null;
  private tooltip: HTMLDivElement | null = null;
  private exitButton: HTMLDivElement | null = null;
  private isActive = false;
  private highlightColor = "#10B981"; // Default emerald-500

  /**
   * Set the highlight color
   */
  public setHighlightColor(color: string): void {
    this.highlightColor = color;
    if (this.isActive) {
      this.updateStyles();
    }
  }

  /**
   * Initialize and inject overlay elements into the page
   */
  public activate(): void {
    if (this.isActive) return;

    this.createOverlay();
    this.createTooltip();
    this.createExitButton();
    this.injectStyles();
    this.isActive = true;

    // Add inspecting class to body
    document.body.classList.add("ractest-inspecting");
  }

  /**
   * Remove overlay elements from the page
   */
  public deactivate(): void {
    if (!this.isActive) return;

    this.overlay?.remove();
    this.tooltip?.remove();
    this.exitButton?.remove();
    this.removeStyles();

    this.overlay = null;
    this.tooltip = null;
    this.exitButton = null;
    this.isActive = false;

    // Remove inspecting class from body
    document.body.classList.remove("ractest-inspecting");
  }

  /**
   * Highlight an element with the overlay
   */
  private hideTimeout: ReturnType<typeof setTimeout> | null = null;

  /**
   * Highlight an element with the overlay
   */
  public highlightElement(
    element: HTMLElement,
    selectorText?: string,
    duration?: number,
  ): void {
    // Clear any pending hide timeout
    if (this.hideTimeout) {
      clearTimeout(this.hideTimeout);
      this.hideTimeout = null;
    }

    // Lazily create elements if they don't exist
    if (!this.overlay) {
      this.createOverlay();
      this.injectStyles();
    }
    if (!this.tooltip) {
      this.createTooltip();
    }

    if (!this.overlay || !this.tooltip) return;

    const rect = element.getBoundingClientRect();
    const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
    const scrollLeft = window.pageXOffset || document.documentElement.scrollLeft;

    this.overlay.style.top = `${rect.top + scrollTop}px`;
    this.overlay.style.left = `${rect.left + scrollLeft}px`;
    this.overlay.style.width = `${rect.width}px`;
    this.overlay.style.height = `${rect.height}px`;
    this.overlay.style.display = "block";

    if (this.tooltip && selectorText) {
      this.tooltip.textContent = selectorText;
      this.tooltip.style.top = `${rect.top + scrollTop - 30}px`;
      this.tooltip.style.left = `${rect.left + scrollLeft}px`;
      this.tooltip.style.display = "block";
    }

    // Set auto-hide timeout if duration is provided
    if (duration && duration > 0) {
      this.hideTimeout = setTimeout(() => {
        this.hide();
      }, duration);
    }
  }

  /**
   * Hide the overlay
   */
  public hide(): void {
    if (this.overlay) {
      this.overlay.style.display = "none";
    }
    if (this.tooltip) {
      this.tooltip.style.display = "none";
    }
  }

  /**
   * Show visual confirmation (green flash) when element is captured
   */
  public showCaptureConfirmation(): void {
    if (!this.overlay) return;

    // Flash green (or highlight color)
    this.overlay.style.background = this.hexToRgba(this.highlightColor, 0.4);
    this.overlay.style.borderColor = this.highlightColor;
    this.overlay.style.borderWidth = "3px";

    setTimeout(() => {
      if (this.overlay) {
        this.overlay.style.background = this.hexToRgba(
          this.highlightColor,
          0.1,
        );
        this.overlay.style.borderWidth = "2px";
      }
    }, 300);
  }

  /**
   * Set handler for exit button
   */
  public onExitClick(handler: () => void): void {
    if (this.exitButton) {
      this.exitButton.addEventListener("click", handler);
    }
  }

  private createOverlay(): void {
    this.overlay = document.createElement("div");
    this.overlay.id = OVERLAY_ID;
    this.overlay.className = "ractest-overlay";
    this.overlay.style.display = "none";
    document.body.appendChild(this.overlay);
  }

  private createTooltip(): void {
    this.tooltip = document.createElement("div");
    this.tooltip.id = TOOLTIP_ID;
    this.tooltip.className = "ractest-tooltip";
    this.tooltip.style.display = "none";
    document.body.appendChild(this.tooltip);
  }

  private createExitButton(): void {
    this.exitButton = document.createElement("div");
    this.exitButton.id = EXIT_BUTTON_ID;
    this.exitButton.className = "ractest-exit-button";
    this.exitButton.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
      </svg>
      <span>ESC para salir</span>
    `;
    document.body.appendChild(this.exitButton);
  }

  private injectStyles(): void {
    const styleId = "ractest-inspector-styles";
    if (document.getElementById(styleId)) return;

    const style = document.createElement("style");
    style.id = styleId;
    style.textContent = this.getStyles();
    document.head.appendChild(style);
  }

  private updateStyles(): void {
    const style = document.getElementById("ractest-inspector-styles");
    if (style) {
      style.textContent = this.getStyles();
    }
  }

  private getStyles(): string {
    return `
      @keyframes ractest-pulse {
        0% { box-shadow: 0 0 0 0 ${this.hexToRgba(this.highlightColor, 0.7)}; }
        70% { box-shadow: 0 0 0 10px ${this.hexToRgba(this.highlightColor, 0)}; }
        100% { box-shadow: 0 0 0 0 ${this.hexToRgba(this.highlightColor, 0)}; }
      }

      .ractest-overlay {
        position: absolute;
        border: 2px solid ${this.highlightColor};
        background: ${this.hexToRgba(this.highlightColor, 0.2)};
        pointer-events: none;
        z-index: 999998;
        transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
        box-sizing: border-box;
        border-radius: 4px;
        animation: ractest-pulse 2s infinite;
      }


      .ractest-tooltip {
        position: absolute;
        background: #0F172A;
        color: ${this.highlightColor};
        padding: 6px 12px;
        font-size: 12px;
        font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
        border-radius: 4px;
        pointer-events: none;
        z-index: 999999;
        white-space: nowrap;
        box-shadow: 0 4px 6px rgba(0, 0, 0, 0.3);
        max-width: 400px;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .ractest-exit-button {
        position: fixed;
        top: 20px;
        right: 20px;
        background: #EF4444;
        color: white;
        padding: 10px 16px;
        border-radius: 8px;
        font-size: 14px;
        font-weight: 600;
        cursor: pointer;
        z-index: 1000000;
        display: flex;
        align-items: center;
        gap: 8px;
        box-shadow: 0 4px 12px rgba(239, 68, 68, 0.4);
        transition: all 0.2s ease;
      }

      .ractest-exit-button:hover {
        background: #DC2626;
        transform: translateY(-2px);
        box-shadow: 0 6px 16px rgba(239, 68, 68, 0.5);
      }

      .ractest-exit-button svg {
        width: 16px;
        height: 16px;
      }

      body.ractest-inspecting,
      body.ractest-inspecting * {
        cursor: crosshair !important;
      }

      .ractest-exit-button * {
        cursor: pointer !important;
      }
    `;
  }

  private hexToRgba(hex: string, alpha: number): string {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  private removeStyles(): void {
    const style = document.getElementById("ractest-inspector-styles");
    style?.remove();
  }
}
