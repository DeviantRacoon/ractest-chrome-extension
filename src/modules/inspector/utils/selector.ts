/**
 * Smart Selector Engine for RacTest
 * Generates the most reliable and unique selector for a given DOM element
 */

import type { SelectorInfo } from "../../../commons/types";

/**
 * Check if ID looks dynamic (e.g. frmb-123456789)
 */
function isDynamicId(id: string): boolean {
  if (!id) return false;
  // Common patterns for dynamic IDs
  if (/^frmb-\d+/.test(id)) return true; // jQuery FormBuilder
  if (/^label-frmb-\d+/.test(id)) return true; // Derived labels
  if (/\d{10,}/.test(id)) return true; // Long numbers
  if (/[a-z0-9]{8}-[a-z0-9]{4}-[a-z0-9]{4}/.test(id)) return true; // UUIDs
  if (id.includes('"') || id.includes("'") || /\s/.test(id)) return true; // Quotes or whitespace
  return false;
}

/**
 * Result of text analysis
 */
interface TextAnalysis {
  value: string;
  source: "content" | "label" | "placeholder";
}

/**
 * Get significant text info from element
 */
function getSignificantTextInfo(element: HTMLElement): TextAnalysis | null {
  // 1. Check for associated label (Robust for inputs)
  if (element.id) {
    const label = document.querySelector(
      `label[for="${CSS.escape(element.id)}"]`,
    );
    if (label && label.textContent && label.textContent.trim().length > 0) {
      return { value: label.textContent.trim(), source: "label" };
    }
  }

  // 2. Check strict text content
  // validation: Don't use content text for inputs or contenteditable (it changes!)
  const isInput =
    element instanceof HTMLInputElement ||
    element instanceof HTMLTextAreaElement ||
    element.isContentEditable ||
    element.getAttribute("contenteditable") === "true";

  if (!isInput) {
    const text = element.textContent?.trim();
    if (text && text.length > 0 && text.length < 50) {
      return { value: text, source: "content" };
    }
  }

  // 3. For inputs, check placeholder (Fallback)
  if (
    element instanceof HTMLInputElement ||
    element instanceof HTMLTextAreaElement
  ) {
    if (element.placeholder)
      return { value: element.placeholder, source: "placeholder" };
  }

  // 4. For generic divs acting as inputs, check placeholder attr
  if (element.getAttribute("placeholder")) {
    return {
      value: element.getAttribute("placeholder")!,
      source: "placeholder",
    };
  }

  return null;
}

/**
 * Generate comprehensive selector information for an element
 */
export function generateSelector(element: HTMLElement): SelectorInfo {
  const textInfo = getSignificantTextInfo(element);

  const selectorInfo: SelectorInfo = {
    tagName: element.tagName.toLowerCase(),
    // We only expose 'text' if it's strict content, otherwise we handle via xpath
    text: textInfo?.source === "content" ? textInfo.value : undefined,
  };

  if (element instanceof HTMLInputElement) {
    selectorInfo.inputType = (element.type || "").toLowerCase();
    selectorInfo.checked = element.checked;
  }

  // Store label info for custom xpath generation later if needed
  // (We don't have a specific field in SelectorInfo for "labelText" yet, so we'll encode it in the XPath)

  // 1. data-testid (highest priority)
  if (element.dataset.testid) {
    selectorInfo.testId = element.dataset.testid;
  }

  // 2. data-type (high priority for form builders)
  if (element.getAttribute("data-type")) {
    selectorInfo.dataType = element.getAttribute("data-type") || undefined;
  }

  // 3. id attribute (only if not dynamic)
  // Note: We might use ID for linking to label even if dynamic, but not as direct selector
  if (element.id && !isDynamicId(element.id)) {
    selectorInfo.id = element.id;
  }

  // 4. name attribute
  const nameAttr = element.getAttribute("name");
  if (nameAttr) {
    selectorInfo.name = nameAttr;
  }

  // 5. aria-label
  const ariaLabel = element.getAttribute("aria-label");
  if (ariaLabel) {
    selectorInfo.ariaLabel = ariaLabel;
  }

  // 6. CSS Selector (optimized)
  selectorInfo.cssSelector = generateCSSSelector(element);

  // 7. XPath (robust)
  selectorInfo.xpath = generateSmartXPath(element, textInfo);

  return selectorInfo;
}

/**
 * Get the best selector based on priority and uniqueness
 */
export function getBestSelector(selectorInfo: SelectorInfo): string {
  // Priority 1: data-testid
  if (
    selectorInfo.testId &&
    isUnique(`[data-testid="${selectorInfo.testId}"]`)
  ) {
    return `[data-testid="${selectorInfo.testId}"]`;
  }

  // Priority 2: data-type
  if (
    selectorInfo.dataType &&
    isUnique(`[data-type="${selectorInfo.dataType}"]`)
  ) {
    return `[data-type="${selectorInfo.dataType}"]`;
  }

  // Priority 3: XPath (Smart Label/Text)
  // We prioritize XPath now if it was generated from a strong signal (like a label)
  // because CSS selectors often fail to capture "Label -> Input" relationships lightly.
  if (selectorInfo.xpath && validateSelector(selectorInfo.xpath)) {
    // Check uniqueness logic (now robust thanks to makeXPathUnique during generation)
    if (isUnique(selectorInfo.xpath)) {
      return selectorInfo.xpath;
    }
  }

  // Priority 4: Stable ID
  if (selectorInfo.id && isUnique(`#${CSS.escape(selectorInfo.id)}`)) {
    return `#${CSS.escape(selectorInfo.id)}`;
  }

  // Priority 5: Name
  if (
    selectorInfo.name &&
    isUnique(`[name="${CSS.escape(selectorInfo.name)}"]`)
  ) {
    return `[name="${CSS.escape(selectorInfo.name)}"]`;
  }

  // Priority 6: CSS Selector
  if (selectorInfo.cssSelector && isUnique(selectorInfo.cssSelector)) {
    return selectorInfo.cssSelector;
  }

  // Priority 7: XPath fallback
  return selectorInfo.xpath || selectorInfo.cssSelector || "body";
}

/**
 * Generate optimized CSS selector for an element
 */
function generateCSSSelector(element: HTMLElement): string {
  const path: string[] = [];
  let current: HTMLElement | null = element;

  while (current && current !== document.body) {
    let selector = current.tagName.toLowerCase();

    // 1. ID (if stable)
    if (current.id && !isDynamicId(current.id)) {
      selector += `#${CSS.escape(current.id)}`;
      path.unshift(selector);
      break;
    }

    // 2. data-testid
    if (current.dataset.testid) {
      selector += `[data-testid="${current.dataset.testid}"]`;
      path.unshift(selector);
      break;
    }

    // 3. data-type
    if (current.getAttribute("data-type")) {
      selector += `[data-type="${current.getAttribute("data-type")}"]`;
    }

    // 4. Special handling for FormBuilder "Name" inputs
    // They often have class "fld-name" or name="name" or name="label"
    if (current.getAttribute("name")) {
      selector += `[name="${current.getAttribute("name")}"]`;
    }

    // 5. Classes
    if (current.className && typeof current.className === "string") {
      const classes = current.className
        .split(/\s+/)
        .filter((c) => c.length > 0);
      if (classes.length > 0 && classes.length < 4) {
        if (
          !current.getAttribute("data-type") &&
          !current.getAttribute("name")
        ) {
          selector += "." + classes.map((c) => CSS.escape(c)).join(".");
        }
      }
    }

    // 6. nth-of-type
    const parent = current.parentElement;
    if (parent) {
      const siblings = Array.from(parent.children);
      const matches = siblings.filter((sib) => {
        if (sib.tagName.toLowerCase() !== current!.tagName.toLowerCase())
          return false;
        // approximate check
        if (
          current!.getAttribute("name") &&
          sib.getAttribute("name") !== current!.getAttribute("name")
        )
          return false;
        return true;
      });

      if (matches.length > 1) {
        const index = matches.indexOf(current) + 1;
        selector += `:nth-of-type(${index})`;
      }
    }

    path.unshift(selector);
    current = current.parentElement;
  }

  return path.join(" > ");
}

/**
 * Generate Smart XPath
 */
/**
 * Generate Smart XPath with Auto-Indexing for Uniqueness
 */
function generateSmartXPath(
  element: HTMLElement,
  textInfo: TextAnalysis | null,
): string {
  let basePath = "";

  // 1. Stable ID
  if (element.id && !isDynamicId(element.id)) {
    return `//*[@id="${element.id}"]`;
  }

  const tagName = element.tagName.toLowerCase();

  // 2. Semantic Text match
  if (textInfo) {
    const safeText = textInfo.value.includes('"')
      ? `concat('${textInfo.value.replace(/'/g, "', \"'\", '")}')`
      : `'${textInfo.value}'`;

    if (textInfo.source === "label") {
      // Linked Label
      basePath = `//${tagName}[@id = //label[contains(., ${safeText})]/@for]`;
    } else if (textInfo.source === "placeholder") {
      basePath = `//${tagName}[@placeholder=${safeText}]`;
    } else if (textInfo.source === "content") {
      basePath = `//${tagName}[contains(., ${safeText})]`;
    }
  }

  // If we have a base semantic path, check its uniqueness and index if needed
  if (basePath) {
    const uniquePath = makeXPathUnique(basePath, element);
    if (uniquePath) return uniquePath;
  }

  // 3. Fallback to hierarchy logic (classic absolute XPath)
  const path: string[] = [];
  let current: HTMLElement | null = element;

  while (current && current !== document.body) {
    let index = 0;
    let sibling: Element | null = current.previousElementSibling;

    while (sibling) {
      if (sibling.tagName === current.tagName) {
        index++;
      }
      sibling = sibling.previousElementSibling;
    }

    const t = current.tagName.toLowerCase();
    const position = index > 0 ? `[${index + 1}]` : "";
    path.unshift(`${t}${position}`);

    current = current.parentElement;
  }

  return "//" + path.join("/");
}

/**
 * Given a base XPath selector, check if it matches multiple elements.
 * If so, determine which index corresponds to 'targetElement' and return `(base)[i]`.
 * If it matches only targetElement, return base.
 * If it doesn't match targetElement (weird), return null.
 */
function makeXPathUnique(
  basePath: string,
  targetElement: HTMLElement,
): string | null {
  try {
    const result = document.evaluate(
      basePath,
      document,
      null,
      XPathResult.ORDERED_NODE_SNAPSHOT_TYPE,
      null,
    );
    const count = result.snapshotLength;

    if (count === 0) return null;
    if (count === 1) {
      return result.snapshotItem(0) === targetElement ? basePath : null;
    }

    // Multiple matches, find our index
    for (let i = 0; i < count; i++) {
      if (result.snapshotItem(i) === targetElement) {
        // XPath uses 1-based indexing
        return `(${basePath})[${i + 1}]`;
      }
    }
    return null;
  } catch (e) {
    return null;
  }
}

/**
 * Check if a selector is unique
 */
function isUnique(selector: string): boolean {
  try {
    if (
      selector.startsWith("//") ||
      selector.startsWith("(") ||
      selector.includes("/@")
    ) {
      const result = document.evaluate(
        selector,
        document,
        null,
        XPathResult.ORDERED_NODE_SNAPSHOT_TYPE,
        null,
      );
      return result.snapshotLength === 1;
    }
    const elements = document.querySelectorAll(selector);
    return elements.length === 1;
  } catch (e) {
    return false;
  }
}

/**
 * Validate that a selector can find an element (supports XPath)
 */
export function validateSelector(selector: string): boolean {
  try {
    if (
      selector.startsWith("//") ||
      selector.startsWith("(") ||
      selector.includes("/@")
    ) {
      const result = document.evaluate(
        selector,
        document,
        null,
        XPathResult.FIRST_ORDERED_NODE_TYPE,
        null,
      );
      return result.singleNodeValue !== null;
    }
    const element = document.querySelector(selector);
    return element !== null;
  } catch (e) {
    return false;
  }
}

/**
 * Find element using selector
 */
export function findElement(selectorInfo: SelectorInfo): HTMLElement | null {
  const candidates = [
    selectorInfo.testId ? `[data-testid="${selectorInfo.testId}"]` : null,
    selectorInfo.dataType ? `[data-type="${selectorInfo.dataType}"]` : null,
    selectorInfo.xpath, // Try XPath early if it's semantic
    selectorInfo.id && !isDynamicId(selectorInfo.id)
      ? `#${CSS.escape(selectorInfo.id)}`
      : null,
    selectorInfo.name ? `[name="${CSS.escape(selectorInfo.name)}"]` : null,
    selectorInfo.cssSelector,
  ].filter(Boolean) as string[];

  for (const selector of candidates) {
    try {
      if (
        selector.includes("//") ||
        selector.includes("/@") ||
        selector.startsWith("xpath:")
      ) {
        const cleanSelector = selector.replace(/^xpath:/, "");
        const result = document.evaluate(
          cleanSelector,
          document,
          null,
          XPathResult.FIRST_ORDERED_NODE_TYPE,
          null,
        );
        if (result.singleNodeValue)
          return result.singleNodeValue as HTMLElement;
      } else {
        const element = document.querySelector(selector) as HTMLElement;
        if (element) return element;
      }
    } catch (e) {
      // ignore
    }
  }

  return null;
}
