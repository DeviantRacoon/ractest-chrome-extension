/**
 * DOM Distiller (Content Script Version)
 * Simplifies the DOM tree and pre-calculates selectors for AI analysis.
 */

import {
  generateSelector,
  getBestSelector,
} from "../../inspector/utils/selector";

export interface DistilledElement {
  id: number;
  tagName: string;
  text: string;
  selector: string;
  attributes: Record<string, string>;
  isInteractive: boolean;
}

export class DOMDistiller {
  private indexCounter = 0;
  private elements: DistilledElement[] = [];

  public distill(mode: "fast" | "normal" | "complex" = "normal"): string {
    this.indexCounter = 0;
    this.elements = [];

    // --- STRATEGY SELECTION ---
    if (mode === "complex") {
      // COMPLEX: TreeWalker (Scans everything)
      const walker = document.createTreeWalker(
        document.body,
        NodeFilter.SHOW_ELEMENT,
        {
          acceptNode: (node) => {
            const el = node as HTMLElement;
            // Filter out obviously non-interactive branches
            const tag = el.tagName.toLowerCase();
            if (
              [
                "script",
                "style",
                "noscript",
                "svg",
                "path",
                "head",
                "meta",
                "link",
              ].includes(tag)
            ) {
              return NodeFilter.FILTER_REJECT;
            }
            if (el.getAttribute("aria-hidden") === "true") {
              return NodeFilter.FILTER_REJECT;
            }
            return NodeFilter.FILTER_ACCEPT;
          },
        },
      );

      while (walker.nextNode()) {
        const el = walker.currentNode as HTMLElement;
        if (this.isInteractive(el) && this.isVisible(el)) {
          this.processElement(el); // direct process
        }
      }
    } else {
      // FAST & NORMAL: QuerySelectorAll
      let selectors =
        "button, input, select, textarea, a, [role='button'], [role='link'], [role='checkbox'], [role='menuitem'], [role='tab'], [role='combobox']";

      if (mode === "normal") {
        // Include text content for context, matching som-content.js logic
        selectors +=
          ", [contenteditable='true'], h1, h2, h3, h4, h5, h6, p, li, [data-testid]";
      }

      const nodeList = document.querySelectorAll(selectors);
      nodeList.forEach((el) => {
        if (this.isVisible(el as HTMLElement)) {
          // Additional filter for text elements in Normal mode
          if (mode === "normal") {
            const element = el as HTMLElement;
            const tag = element.tagName.toLowerCase();
            const isInput = [
              "input",
              "textarea",
              "select",
              "button",
              "a",
            ].includes(tag);
            const hasText =
              element.innerText && element.innerText.trim().length > 0;
            const isRoleAttr = element.hasAttribute("role");

            // If it's not a standard interactive element, ensure it has text
            // (This effectively filters out empty divs/spans unless they have a role)
            if (
              !isInput &&
              !isRoleAttr &&
              !hasText &&
              !this.isInteractive(element)
            ) {
              return;
            }
          }

          this.processElement(el as HTMLElement);
        }
      });
    }

    // Convert to simplified HTML-like string for LLM
    // Format: [id] <TAG attributes...>TEXT</TAG> (selector: "...")
    return this.elements
      .map((el) => {
        const attrString = Object.entries(el.attributes)
          .map(([k, v]) => `${k}="${v}"`)
          .join(" ");

        const tagPart =
          `<${el.tagName.toUpperCase()} ${attrString}`.trim() + ">";
        const contentPart = el.text ? `${el.text}` : "";
        const closePart = `</${el.tagName.toUpperCase()}>`;

        // Use JSON.stringify to ensure selector is properly escaped
        return `[${el.id}] ${tagPart}${contentPart}${closePart} \n    --> selector: ${JSON.stringify(el.selector)}`;
      })
      .join("\n\n");
  }

  private isInteractive(el: HTMLElement): boolean {
    const tag = el.tagName.toLowerCase();
    if (["iframe", "script", "style", "noscript", "head", "meta"].includes(tag))
      return false;

    if (
      [
        "button",
        "a",
        "input",
        "select",
        "textarea",
        "details",
        "summary",
      ].includes(tag)
    )
      return true;

    const role = el.getAttribute("role");
    if (
      role &&
      ["button", "link", "checkbox", "menuitem", "tab", "combobox"].includes(
        role,
      )
    )
      return true;

    if (el.getAttribute("contenteditable") === "true") return true;

    // Check for pointer style (heuristic)
    try {
      const style = window.getComputedStyle(el);
      if (style.cursor === "pointer") return true;
    } catch {
      // ignore
    }

    return false;
  }

  private isVisible(el: HTMLElement): boolean {
    try {
      const style = window.getComputedStyle(el);
      if (
        style.display === "none" ||
        style.visibility === "hidden" ||
        style.opacity === "0"
      )
        return false;
      const rect = el.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    } catch {
      return false;
    }
  }

  private processElement(el: HTMLElement): void {
    // If called from walker/query, we know it's interactive (mostly).
    // If recursive (not used in this new logic but kept for safety), checks needed.

    // In new logic, we iterate candidates directly.
    // So we just extract info.

    const tag = el.tagName.toLowerCase();
    const selectorInfo = generateSelector(el);
    const bestSelector = getBestSelector(selectorInfo);

    // Get attributes
    const attributes: Record<string, string> = {};
    if (el.id) attributes.id = el.id;
    if (el.getAttribute("name")) attributes.name = el.getAttribute("name")!;
    if (el.getAttribute("type")) attributes.type = el.getAttribute("type")!;
    if (el.getAttribute("placeholder"))
      attributes.placeholder = el.getAttribute("placeholder")!;
    if (el.getAttribute("aria-label"))
      attributes["aria-label"] = el.getAttribute("aria-label")!;
    if (el.getAttribute("role")) attributes.role = el.getAttribute("role")!;
    if (el.getAttribute("title")) attributes.title = el.getAttribute("title")!;

    // Get text
    let text = "";
    if (tag === "input" || tag === "textarea") {
      const val = (el as HTMLInputElement).value;
      if (val) text = `[Value: ${val}]`;
    } else if (tag === "select") {
      const sel = el as HTMLSelectElement;
      text = `[Selected: ${sel.options[sel.selectedIndex]?.text || ""}]`;
      const optionValues: string[] = [];
      const optionLabels: string[] = [];
      for (const opt of Array.from(sel.options)) {
        optionValues.push(this.sanitizeAttrValue(opt.value || ""));
        optionLabels.push(this.sanitizeAttrValue(opt.text || ""));
      }
      if (optionValues.length > 0) {
        attributes["select-values"] = optionValues.join("|");
        attributes["select-labels"] = optionLabels.join("|");
        attributes["selected-value"] = this.sanitizeAttrValue(sel.value || "");
      }
    } else {
      // Get direct text content or first few chars
      text = el.innerText?.substring(0, 100).replace(/[\n\r]+/g, " ") || "";
    }

    // Context Heuristic for Normal Mode (similar to som-content.js)
    // We append it to text or attributes for the LLM to see
    // only if we are in normal mode?
    // Actually, distinct modes is good. The caller passed mode.
    // NOTE: This method doesn't know 'mode' unless we pass it or store it.
    // I will refactor to store mode in class or pass it.
    // For now, I'll just add context if it finds it, it helps LLM regardless of mode (except Fast where we want speed).
    // But since 'Fast' mode candidates won't call getContext usually in som-content,
    // here I'm calculating it.
    // Let's keep it simple: always get some context if easy.
    // Or better, let's just use the label logic if present.

    // Check explicit label
    if (el.id) {
      const label = document.querySelector(`label[for="${el.id}"]`);
      if (label && label instanceof HTMLElement) {
        attributes["label"] = label.innerText.trim();
      }
    }

    this.elements.push({
      id: ++this.indexCounter,
      tagName: tag,
      text,
      selector: bestSelector,
      attributes,
      isInteractive: true,
    });
  }

  private sanitizeAttrValue(value: string): string {
    return value
      .replace(/"/g, "")
      .replace(/\|/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }
}

export const domDistiller = new DOMDistiller();
