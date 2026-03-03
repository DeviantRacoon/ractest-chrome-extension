/**
 * Overlay System for RacTest Inspector
 * Creates visual feedback for element inspection
 */

import {
  CheckSquare,
  List,
  MousePointerClick,
  Square,
  Type,
} from "lucide-react";
import React from "react";
import { createRoot, type Root } from "react-dom/client";
import Input from "../../../commons/components/ui/Input";
import type { SelectOption } from "../../../commons/components/ui/Select";
import { Select } from "../../../commons/components/ui/Select";
import overlayStyles from "./OverlaySystem.css?inline";
import type {
  AppLanguage,
  AppLanguagePreference,
  CaptureAction,
  CaptureStepDraft,
  FakeDataType,
} from "../../../commons/types";

import en from "../../../commons/i18n/messages/en";
import es from "../../../commons/i18n/messages/es";
import storageService from "../../../commons/lib/storage";

interface SelectOptionPair {
  label: string;
  value: string;
}

const OVERLAY_ID = "ractest-inspector-overlay";
const TOOLTIP_ID = "ractest-inspector-tooltip";
const EXIT_BUTTON_ID = "ractest-exit-inspector";
const CAPTURE_MENU_ID = "ractest-capture-menu";

export class OverlaySystem {
  private overlay: HTMLDivElement | null = null;
  private tooltip: HTMLDivElement | null = null;
  private exitButton: HTMLDivElement | null = null;
  private captureMenu: HTMLDivElement | null = null;
  private actionSelectRoot: Root | null = null;
  private fakeTypeSelectRoot: Root | null = null;
  private valueInputRoot: Root | null = null;
  private delayInputRoot: Root | null = null;
  private repositionMenuListener: (() => void) | null = null;
  private isActive = false;
  private highlightColor = "#10B981"; // Default emerald-500
  private language: AppLanguage = "en";
  private readonly dictionaries: Record<AppLanguage, Record<string, string>> = {
    en: en as Record<string, string>,
    es: es as Record<string, string>,
  };

  /**
   * Set the highlight color
   */
  public setHighlightColor(color: string): void {
    this.highlightColor = color;
    if (this.isActive) {
      this.applyHighlightVariables();
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
    this.applyHighlightVariables();
    this.isActive = true;
    void this.syncLanguage();

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
    this.captureMenu?.remove();
    this.removeStyles();

    this.overlay = null;
    this.tooltip = null;
    this.exitButton = null;
    this.captureMenu = null;
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
    const scrollLeft =
      window.pageXOffset || document.documentElement.scrollLeft;

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

  public isCaptureMenuOpen(): boolean {
    return !!this.captureMenu;
  }

  public hideCaptureMenu(): void {
    this.actionSelectRoot?.unmount();
    this.fakeTypeSelectRoot?.unmount();
    this.valueInputRoot?.unmount();
    this.delayInputRoot?.unmount();
    this.actionSelectRoot = null;
    this.fakeTypeSelectRoot = null;
    this.valueInputRoot = null;
    this.delayInputRoot = null;
    if (this.repositionMenuListener) {
      window.removeEventListener("resize", this.repositionMenuListener);
      this.repositionMenuListener = null;
    }
    this.captureMenu?.remove();
    this.captureMenu = null;
  }

  public async showCaptureMenu(params: {
    x: number;
    y: number;
    defaultAction: CaptureAction;
    defaultValue?: string;
    selectOptions?: SelectOptionPair[];
    defaultDelay: number;
    onSave: (draft: CaptureStepDraft) => void;
    onCancel: () => void;
  }): Promise<void> {
    await this.syncLanguage();
    this.hideCaptureMenu();
    const fakeDataOptions: FakeDataType[] = [
      "name",
      "firstName",
      "lastName",
      "email",
      "username",
      "password",
      "phone",
      "address",
      "city",
      "state",
      "zipCode",
      "country",
      "company",
      "jobTitle",
      "url",
      "date",
      "time",
      "datetime",
      "number",
      "price",
      "uuid",
      "color",
      "lorem",
    ];
    const copy = {
      title: this.t("inspector.captureMenu.title", "Configure step"),
      subtitle: this.t(
        "inspector.captureMenu.subtitle",
        "Adjust action details before saving.",
      ),
      action: this.t("inspector.captureMenu.action", "Action"),
      value: this.t("inspector.captureMenu.value", "Value"),
      optionValue: this.t("inspector.captureMenu.optionValue", "Option value"),
      selectOptionsTitle: this.t(
        "inspector.captureMenu.selectOptionsTitle",
        "Available options (label | value)",
      ),
      noSelectOptions: this.t(
        "inspector.captureMenu.noSelectOptions",
        "No options found for this select.",
      ),
      uniqueText: this.t(
        "stepEditor.stepCard.uniqueText",
        "Unique text (append UUID)",
      ),
      useFakeData: this.t("stepEditor.stepCard.useFakeData", "Use fake data"),
      fakeDataType: this.t(
        "stepEditor.stepCard.fakeDataType",
        "Fake data type",
      ),
      delay: this.t("stepEditor.stepCard.delay", "Delay (ms)"),
      cancel: this.t("settings.confirmReset.cancel", "Cancel"),
      save: this.t("settings.save", "Save"),
      requiredValueError: this.t(
        "inspector.captureMenu.error.valueRequired",
        "This action requires a value.",
      ),
      click: this.t("stepEditor.action.CLICK", "Click"),
      type: this.t("stepEditor.action.TYPE", "Type"),
      select: this.t("stepEditor.action.SELECT", "Select"),
      check: this.t("stepEditor.action.CHECK", "Check"),
      uncheck: this.t("stepEditor.action.UNCHECK", "Uncheck"),
    };
    let selectedAction: CaptureAction = params.defaultAction;
    let selectedFakeDataType: FakeDataType = "name";

    const menu = document.createElement("div");
    menu.id = CAPTURE_MENU_ID;
    menu.className = "ractest-capture-menu";
    menu.innerHTML = `
      <div class="ractest-capture-menu-title">${copy.title}</div>
      <div class="ractest-capture-menu-subtitle">${copy.subtitle}</div>
      <label class="ractest-capture-menu-label" for="ractest-capture-action">${copy.action}</label>
      <div id="ractest-capture-action-react" class="ractest-react-select"></div>
      <div id="ractest-capture-value-wrap">
        <label class="ractest-capture-menu-label" id="ractest-capture-value-label" for="ractest-capture-value">${copy.value}</label>
        <div id="ractest-capture-value-react"></div>
        <div id="ractest-capture-select-options" class="ractest-select-options">
          <div class="ractest-select-options-title">${copy.selectOptionsTitle}</div>
          <div id="ractest-capture-select-options-list" class="ractest-select-options-list"></div>
        </div>
      </div>
      <div id="ractest-capture-type-options" class="ractest-toggle-group">
        <label class="ractest-switch">
          <input id="ractest-capture-unique" type="checkbox" />
          <span class="ractest-switch-track"><span class="ractest-switch-thumb"></span></span>
          <span class="ractest-switch-label">${copy.uniqueText}</span>
        </label>
        <label class="ractest-switch">
          <input id="ractest-capture-fake" type="checkbox" />
          <span class="ractest-switch-track"><span class="ractest-switch-thumb"></span></span>
          <span class="ractest-switch-label">${copy.useFakeData}</span>
        </label>
      </div>
      <div id="ractest-capture-fake-type-wrap">
        <label class="ractest-capture-menu-label" for="ractest-capture-fake-type">${copy.fakeDataType}</label>
        <div id="ractest-capture-fake-type-react" class="ractest-react-select"></div>
      </div>
      <label class="ractest-capture-menu-label" for="ractest-capture-delay">${copy.delay}</label>
      <div id="ractest-capture-delay-react"></div>
      <div id="ractest-capture-error" class="ractest-capture-menu-error"></div>
      <div class="ractest-capture-menu-actions">
        <button type="button" id="ractest-capture-cancel" class="ractest-capture-btn ractest-capture-btn-secondary">
          <span class="ractest-capture-btn-icon" aria-hidden="true">${this.cancelIcon()}</span>
          <span>${copy.cancel}</span>
        </button>
        <button type="button" id="ractest-capture-save" class="ractest-capture-btn ractest-capture-btn-primary">
          <span class="ractest-capture-btn-icon" aria-hidden="true">${this.saveIcon()}</span>
          <span>${copy.save}</span>
          <kbd class="ractest-capture-btn-kbd">⏎</kbd>
        </button>
      </div>
    `;

    // Position with visibility hidden first so we can measure before showing
    menu.style.visibility = "hidden";
    document.body.appendChild(menu);
    this.captureMenu = menu;

    const repositionMenu = () => {
      const padding = 12;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      menu.style.maxHeight = `${Math.max(280, vh - padding * 2)}px`;
      menu.style.overflowY = "auto";

      const menuRect = menu.getBoundingClientRect();
      const menuW = menuRect.width;
      const menuH = menuRect.height;

      // Horizontal: prefer right of click, flip left if overflow
      let left = params.x + 12;
      if (left + menuW + padding > vw) {
        left = Math.max(padding, params.x - menuW - 12);
      }
      left = Math.max(padding, Math.min(left, vw - menuW - padding));

      // Vertical: prefer below click, flip above if overflow
      let top = params.y + 12;
      if (top + menuH + padding > vh) {
        top = Math.max(padding, params.y - menuH - 12);
      }
      top = Math.max(padding, Math.min(top, vh - menuH - padding));

      menu.style.left = `${left}px`;
      menu.style.top = `${top}px`;

      // Reveal after positioning
      menu.style.visibility = "visible";
    };

    this.repositionMenuListener = repositionMenu;
    window.addEventListener("resize", repositionMenu);

    const actionSelectMount = menu.querySelector(
      "#ractest-capture-action-react",
    ) as HTMLDivElement | null;
    const valueWrap = menu.querySelector(
      "#ractest-capture-value-wrap",
    ) as HTMLDivElement | null;
    const valueInputMount = menu.querySelector(
      "#ractest-capture-value-react",
    ) as HTMLDivElement | null;
    const valueLabel = menu.querySelector(
      "#ractest-capture-value-label",
    ) as HTMLLabelElement | null;
    const selectOptionsWrap = menu.querySelector(
      "#ractest-capture-select-options",
    ) as HTMLDivElement | null;
    const selectOptionsList = menu.querySelector(
      "#ractest-capture-select-options-list",
    ) as HTMLDivElement | null;
    const typeOptions = menu.querySelector(
      "#ractest-capture-type-options",
    ) as HTMLDivElement | null;
    const uniqueTextCheckbox = menu.querySelector(
      "#ractest-capture-unique",
    ) as HTMLInputElement | null;
    const fakeDataCheckbox = menu.querySelector(
      "#ractest-capture-fake",
    ) as HTMLInputElement | null;
    const fakeTypeWrap = menu.querySelector(
      "#ractest-capture-fake-type-wrap",
    ) as HTMLDivElement | null;
    const fakeTypeSelectMount = menu.querySelector(
      "#ractest-capture-fake-type-react",
    ) as HTMLDivElement | null;
    const delayInputMount = menu.querySelector(
      "#ractest-capture-delay-react",
    ) as HTMLDivElement | null;
    const errorText = menu.querySelector(
      "#ractest-capture-error",
    ) as HTMLDivElement | null;
    const saveButton = menu.querySelector(
      "#ractest-capture-save",
    ) as HTMLButtonElement | null;
    const cancelButton = menu.querySelector(
      "#ractest-capture-cancel",
    ) as HTMLButtonElement | null;

    if (
      !actionSelectMount ||
      !valueWrap ||
      !valueInputMount ||
      !valueLabel ||
      !selectOptionsWrap ||
      !selectOptionsList ||
      !typeOptions ||
      !uniqueTextCheckbox ||
      !fakeDataCheckbox ||
      !fakeTypeWrap ||
      !fakeTypeSelectMount ||
      !delayInputMount ||
      !errorText ||
      !saveButton ||
      !cancelButton
    ) {
      this.hideCaptureMenu();
      params.onCancel();
      return;
    }

    const actionOptions: SelectOption[] = [
      {
        value: "CLICK",
        label: copy.click,
        icon: React.createElement(MousePointerClick, { className: "w-4 h-4" }),
      },
      {
        value: "TYPE",
        label: copy.type,
        icon: React.createElement(Type, { className: "w-4 h-4" }),
      },
      {
        value: "SELECT",
        label: copy.select,
        icon: React.createElement(List, { className: "w-4 h-4" }),
      },
      {
        value: "CHECK",
        label: copy.check,
        icon: React.createElement(CheckSquare, { className: "w-4 h-4" }),
      },
      {
        value: "UNCHECK",
        label: copy.uncheck,
        icon: React.createElement(Square, { className: "w-4 h-4" }),
      },
    ];

    const fakeDataTypeOptions: SelectOption[] = fakeDataOptions.map((item) => ({
      value: item,
      label: this.getFakeDataLabel(item),
    }));

    this.actionSelectRoot = createRoot(actionSelectMount);
    this.fakeTypeSelectRoot = createRoot(fakeTypeSelectMount);
    this.valueInputRoot = createRoot(valueInputMount);
    this.delayInputRoot = createRoot(delayInputMount);

    const renderActionSelect = () => {
      this.actionSelectRoot?.render(
        React.createElement(Select, {
          value: selectedAction,
          onChange: (value: string) => {
            setSelectedAction(value as CaptureAction);
            updateVisibility();
          },
          options: actionOptions,
          fullWidth: true,
        }),
      );
    };

    const renderFakeTypeSelect = () => {
      this.fakeTypeSelectRoot?.render(
        React.createElement(Select, {
          value: selectedFakeDataType,
          onChange: (value: string) => {
            selectedFakeDataType = value as FakeDataType;
          },
          options: fakeDataTypeOptions,
          fullWidth: true,
        }),
      );
    };

    const renderValueInput = () => {
      this.valueInputRoot?.render(
        React.createElement(Input, {
          id: "ractest-capture-value",
          type: "text",
          defaultValue: params.defaultValue || "",
          fullWidth: true,
        }),
      );
    };

    const renderDelayInput = () => {
      this.delayInputRoot?.render(
        React.createElement(Input, {
          id: "ractest-capture-delay",
          type: "number",
          defaultValue: String(params.defaultDelay),
          min: 0,
          step: 100,
          fullWidth: true,
        }),
      );
    };

    const setSelectedAction = (action: CaptureAction) => {
      selectedAction = action;
      renderActionSelect();
    };

    setSelectedAction(params.defaultAction);
    renderFakeTypeSelect();
    renderValueInput();
    renderDelayInput();
    selectedFakeDataType = "name";
    const selectOptions = params.selectOptions ?? [];
    if (selectOptions.length > 0) {
      for (const option of selectOptions) {
        const row = document.createElement("div");
        row.className = "ractest-select-option-item";

        const labelSpan = document.createElement("span");
        labelSpan.className = "ractest-select-option-label";
        labelSpan.textContent = option.label;

        const valueSpan = document.createElement("span");
        valueSpan.className = "ractest-select-option-value";
        valueSpan.textContent = option.value;

        row.append(labelSpan, valueSpan);
        selectOptionsList.appendChild(row);
      }
    } else {
      const empty = document.createElement("div");
      empty.className = "ractest-select-option-empty";
      empty.textContent = copy.noSelectOptions;
      selectOptionsList.appendChild(empty);
    }

    const updateVisibility = () => {
      const action = selectedAction;
      const isType = action === "TYPE";
      const isSelect = action === "SELECT";
      const needsValue = isType || isSelect;
      const useFakeData = isType && fakeDataCheckbox.checked;
      valueWrap.style.display = needsValue ? "block" : "none";
      selectOptionsWrap.style.display = isSelect ? "block" : "none";
      typeOptions.style.display = isType ? "grid" : "none";
      fakeTypeWrap.style.display = useFakeData ? "block" : "none";
      valueLabel.textContent = isSelect ? copy.optionValue : copy.value;
      const valueInput = menu.querySelector(
        "#ractest-capture-value",
      ) as HTMLInputElement | null;
      if (valueInput) {
        valueInput.disabled = useFakeData;
      }
      errorText.textContent = "";
      requestAnimationFrame(repositionMenu);
    };

    updateVisibility();
    fakeDataCheckbox.addEventListener("change", updateVisibility);

    const closeAndCancel = () => {
      this.hideCaptureMenu();
      params.onCancel();
    };

    cancelButton.addEventListener("click", closeAndCancel);

    saveButton.addEventListener("click", () => {
      const action = selectedAction;
      const isType = action === "TYPE";
      const needsValue = isType || action === "SELECT";
      const useFakeData = isType && fakeDataCheckbox.checked;
      const valueInput = menu.querySelector(
        "#ractest-capture-value",
      ) as HTMLInputElement | null;
      const delayInput = menu.querySelector(
        "#ractest-capture-delay",
      ) as HTMLInputElement | null;
      const value = valueInput?.value.trim() || "";
      const delay = Math.max(0, parseInt(delayInput?.value || "0", 10) || 0);

      if (needsValue && !useFakeData && !value) {
        errorText.textContent = copy.requiredValueError;
        valueInput?.focus();
        return;
      }

      this.hideCaptureMenu();
      params.onSave({
        action,
        value: needsValue && !useFakeData ? value : "",
        delay,
        uniqueText: isType ? uniqueTextCheckbox.checked : false,
        useFakeData,
        fakeDataType: useFakeData ? selectedFakeDataType : undefined,
      });
    });

    menu.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeAndCancel();
      } else if (event.key === "Enter") {
        if (document.activeElement !== cancelButton) {
          event.preventDefault();
          saveButton.click();
        }
      }
    });

    requestAnimationFrame(repositionMenu);
  }

  private cancelIcon(): string {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.9" d="M18 6 6 18"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.9" d="m6 6 12 12"/></svg>';
  }

  private saveIcon(): string {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.9" d="m20 6-11 11-5-5"/></svg>';
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
      <span>${this.t("inspector.exitHint", "Press ESC to exit")}</span>
    `;
    document.body.appendChild(this.exitButton);
  }

  private async syncLanguage(): Promise<void> {
    this.language = await this.resolveLanguage();
    const label = this.exitButton?.querySelector("span");
    if (label) {
      label.textContent = this.t("inspector.exitHint", "Press ESC to exit");
    }
  }

  private async resolveLanguage(): Promise<AppLanguage> {
    try {
      const settings = await storageService.getSettings();
      const preference = settings.language ?? "en";
      return this.normalizeLanguagePreference(preference);
    } catch {
      return this.detectSystemLanguage();
    }
  }

  private normalizeLanguagePreference(
    preference: AppLanguagePreference,
  ): AppLanguage {
    if (preference === "auto") {
      return this.detectSystemLanguage();
    }
    return this.normalizeLanguage(preference);
  }

  private detectSystemLanguage(): AppLanguage {
    if (typeof chrome !== "undefined" && chrome.i18n?.getUILanguage) {
      return this.normalizeLanguage(chrome.i18n.getUILanguage());
    }
    if (typeof navigator !== "undefined") {
      return this.normalizeLanguage(navigator.language);
    }
    return "en";
  }

  private normalizeLanguage(value?: string | null): AppLanguage {
    if (!value) return "en";
    const lower = value.toLowerCase();
    if (lower.startsWith("es")) return "es";
    return "en";
  }

  private t(key: string, fallback: string): string {
    const dictionary = this.dictionaries[this.language] ?? this.dictionaries.en;
    return dictionary[key] ?? this.dictionaries.en[key] ?? fallback;
  }

  private getFakeDataLabel(type: FakeDataType): string {
    return this.t(`fakeData.option.${type}`, type);
  }

  private injectStyles(): void {
    const styleId = "ractest-inspector-styles";
    if (document.getElementById(styleId)) return;

    const style = document.createElement("style");
    style.id = styleId;
    style.textContent = overlayStyles;
    document.head.appendChild(style);
  }

  private applyHighlightVariables(): void {
    document.documentElement.style.setProperty(
      "--ractest-highlight",
      this.highlightColor,
    );
    const [r, g, b] = this.hexToRgbTuple(this.highlightColor);
    document.documentElement.style.setProperty(
      "--ractest-highlight-rgb",
      `${r}, ${g}, ${b}`,
    );
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
    document.documentElement.style.removeProperty("--ractest-highlight");
    document.documentElement.style.removeProperty("--ractest-highlight-rgb");
  }

  private hexToRgbTuple(hex: string): [number, number, number] {
    return [
      parseInt(hex.slice(1, 3), 16),
      parseInt(hex.slice(3, 5), 16),
      parseInt(hex.slice(5, 7), 16),
    ];
  }
}
