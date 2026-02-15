/**
 * RACTest Set-of-Marks Content Script Logic
 * This file contains the logic to mark interactive elements on the page.
 */

(function () {
  // Namespace to avoid collisions
  window.RAC_SOM = window.RAC_SOM || {};

  const BADGE_CLASS = "rac-som-badge";
  let elementMap = new Map();

  function isInteractive(element) {
    const tag = element.tagName.toLowerCase();
    if (
      tag === "iframe" ||
      tag === "script" ||
      tag === "style" ||
      tag === "noscript"
    )
      return false;

    // Basic interactive elements
    if (["button", "a", "input", "select", "textarea"].includes(tag))
      return true;

    // Roles
    const role = element.getAttribute("role");
    if (
      ["button", "link", "checkbox", "menuitem", "tab", "combobox"].includes(
        role,
      )
    )
      return true;

    // Event listeners (approximation via cursor)
    const style = window.getComputedStyle(element);
    if (style.cursor === "pointer") return true;

    return false;
  }

  function isVisible(element) {
    const style = window.getComputedStyle(element);
    if (
      style.display === "none" ||
      style.visibility === "hidden" ||
      style.opacity === "0"
    )
      return false;
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  let currentMode = "fast";

  window.RAC_SOM.markElements = function (mode = "fast") {
    currentMode = mode;
    window.RAC_SOM.unmarkElements(); // Clean up first
    elementMap.clear();

    let candidates = [];
    let idCounter = 1;

    // --- STRATEGY SELECTION & COLLECTION ---
    // We first collect ALL candidates, then valid them, then SORT them, then mark them.
    let unsortedCandidates = [];

    if (mode === "fast" || mode === "normal") {
      let selectors =
        "button, input, select, textarea, a, [role='button'], [role='link'], [role='checkbox'], [role='menuitem'], [role='tab'], [role='combobox']";
      if (mode === "normal") {
        selectors +=
          ", [contenteditable='true'], h1, h2, h3, h4, h5, h6, p, li, [data-testid]";
      }
      unsortedCandidates = Array.from(document.querySelectorAll(selectors));
    } else {
      // COMPLEX: TreeWalker
      const walker = document.createTreeWalker(
        document.body,
        NodeFilter.SHOW_ELEMENT,
        {
          acceptNode: function (node) {
            const tag = node.tagName.toLowerCase();
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
            )
              return NodeFilter.FILTER_REJECT;
            if (node.getAttribute("aria-hidden") === "true")
              return NodeFilter.FILTER_REJECT;
            return NodeFilter.FILTER_ACCEPT;
          },
        },
      );

      while (walker.nextNode()) {
        const el = walker.currentNode;
        if (isInteractive(el)) {
          unsortedCandidates.push(el);
        }
      }
    }

    // --- FILTERING & PRE-CALCULATION ---
    let validItems = [];
    unsortedCandidates.forEach((el) => {
      if (!isVisible(el)) return;

      // Mode-specific filtering (Normal mode text check logic)
      if (mode === "normal") {
        const tag = el.tagName.toLowerCase();
        const isInput = ["input", "textarea", "select", "button"].includes(tag);
        const hasText = el.innerText && el.innerText.trim().length > 0;
        // If it's a non-input element (like p, h1, div), it MUST have text to be interesting
        if (!isInput && !hasText && !isInteractive(el)) return;
      }

      validItems.push({
        el: el,
        rect: el.getBoundingClientRect(),
      });
    });

    // --- VISUAL SORTING ---
    // Sort by Top (y), then Left (x)
    // We use a small threshold (e.g. 10px) to group items on the "same line" visually
    validItems.sort((a, b) => {
      const yDiff = a.rect.top - b.rect.top;
      if (Math.abs(yDiff) > 10) {
        return yDiff; // Different lines
      }
      return a.rect.left - b.rect.left; // Same line key
    });

    // --- MARKING ---
    validItems.forEach((item) => {
      const el = item.el;

      // Clean previous attributes
      el.removeAttribute("data-rac-id");

      const id = idCounter++;
      el.setAttribute("data-rac-id", id);
      elementMap.set(id, el);

      if (isInteractive(el)) {
        createBadge(el, id);
      }
    });

    return idCounter - 1; // Return count
  };

  function createBadge(el, id) {
    // Create Badge
    const badge = document.createElement("div");
    badge.className = BADGE_CLASS;
    badge.textContent = id;

    // Style Badge
    const rect = el.getBoundingClientRect();
    Object.assign(badge.style, {
      position: "absolute",
      top: `${window.scrollY + rect.top}px`,
      left: `${window.scrollX + rect.left}px`,
      padding: "2px 4px",
      backgroundColor: "#ff0000",
      color: "white",
      fontSize: "12px",
      fontWeight: "bold",
      zIndex: "2147483647", // Max Z-Index
      pointerEvents: "none",
      borderRadius: "4px",
      boxShadow: "0 2px 4px rgba(0,0,0,0.5)",
      border: "1px solid white",
    });

    document.body.appendChild(badge);
  }

  function getContext(el) {
    // Heuristic: Find closest meaningful container or label
    // 1. Check explicit label
    if (el.id) {
      const label = document.querySelector(`label[for="${el.id}"]`);
      if (label) return label.innerText.trim();
    }

    // 2. Traverse up
    let parent = el.parentElement;
    let depth = 0;
    while (parent && depth < 3) {
      if (parent.tagName === "LABEL") return parent.innerText.trim();
      // If parent has meaningful text and is small enough to be a grouping
      if (
        parent.innerText &&
        parent.innerText.length < 100 &&
        parent.innerText.length > 0
      ) {
        // naive check, but often works for <div class="field">Label: <input></div>
        return parent.innerText.replace(el.innerText, "").trim();
      }
      parent = parent.parentElement;
      depth++;
    }
    return "";
  }

  window.RAC_SOM.getMarkedTree = function () {
    let output = [];

    // Debug
    // console.log("RAC_SOM: getMarkedTree called. Map size:", elementMap.size);

    if (elementMap.size === 0) {
      return "ERROR: Element map is empty in getMarkedTree. Did you call markElements first?";
    }

    try {
      for (const [id, el] of elementMap.entries()) {
        const tag = el.tagName ? el.tagName.toLowerCase() : "unknown";
        let text = "";

        if (tag === "input") {
          text = `placeholder="${el.placeholder || ""}" value="${el.value || ""}" type="${el.type}" name="${el.name || ""}"`;
        } else if (tag === "select") {
          text = `name="${el.name || ""}" selected="${el.options[el.selectedIndex]?.text || ""}"`;
        } else {
          // Safe text extraction
          const rawText = el.innerText || el.textContent || "";
          text = rawText
            .substring(0, 50)
            .replace(/[\n\r]+/g, " ")
            .trim();

          if (!text) {
            text = el.getAttribute("aria-label") || el.title || "";
          }
        }

        let context = "";
        if (currentMode === "normal") {
          const ctx = getContext(el);
          if (ctx)
            context = ` context="${ctx.substring(0, 50).replace(/"/g, "'")}"`;
        }

        output.push(`[${id}] <${tag}${context}>${text}</${tag}>`);
      }
    } catch (e) {
      return `ERROR: getMarkedTree exception: ${e.message}`;
    }

    return output.join("\n");
  };

  /**
   * Scans for visual errors (toasts, alerts, error text)
   * Returns array of error strings
   */
  window.RAC_SOM.scanForErrors = function () {
    const errors = [];

    // 1. Check strict ARIA roles
    const alerts = document.querySelectorAll('[role="alert"], [role="status"]');
    alerts.forEach((el) => {
      if (el.offsetParent !== null) {
        // Visible
        errors.push(`[ARIA] ${el.innerText.trim()}`);
      }
    });

    // 2. Heuristic: Common error classes
    const errorClasses = [
      ".error",
      ".alert-danger",
      ".toast-error",
      ".notification-error",
      ".failed",
    ];
    errorClasses.forEach((selector) => {
      document.querySelectorAll(selector).forEach((el) => {
        if (el.offsetParent !== null && el.innerText.trim().length > 0) {
          errors.push(`[CLASS] ${el.innerText.trim()}`);
        }
      });
    });

    // 3. Heuristic: Text content (expensive, limit scope)
    // Only check small visible elements
    // (Skipped for performance in this iteration, can be added if needed)

    // Deduplicate
    return [...new Set(errors)];
  };

  window.RAC_SOM.unmarkElements = function () {
    const badges = document.querySelectorAll(`.${BADGE_CLASS}`);
    badges.forEach((b) => b.remove());

    // Optional: Remove attributes (expensive on large DOM, maybe skip if not strictly needed)
    // const marked = document.querySelectorAll("[data-rac-id]");
    elementMap.clear();
  };

  window.RAC_SOM.waitForDOMStability = function (
    timeoutMs = 3000,
    stabilityMs = 500,
  ) {
    return new Promise((resolve) => {
      let timer;
      let lastMutation = Date.now();

      const observer = new MutationObserver(() => {
        lastMutation = Date.now();
        // Debounce: Reset the stability timer
        clearTimeout(timer);
        timer = setTimeout(checkStability, stabilityMs);
      });

      observer.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        characterData: true,
      });

      const checkStability = () => {
        const timeSinceLast = Date.now() - lastMutation;
        if (timeSinceLast >= stabilityMs) {
          finish("stable");
        } else {
          // Should have been handled by debounce, but safety check
          timer = setTimeout(checkStability, stabilityMs);
        }
      };

      // Failsafe timeout
      const maxTimeout = setTimeout(() => {
        finish("timeout");
      }, timeoutMs);

      // Start the first stability check
      timer = setTimeout(checkStability, stabilityMs);

      function finish(reason) {
        clearTimeout(timer);
        clearTimeout(maxTimeout);
        observer.disconnect();
        resolve({ reason, timeSinceLastMutation: Date.now() - lastMutation });
      }
    });
  };

  window.RAC_SOM.executeAction = function (id, action, value) {
    const el = document.querySelector(`[data-rac-id="${id}"]`);
    if (!el) {
      throw new Error(`Element with ID ${id} not found`);
    }

    // Scroll into view
    el.scrollIntoView({ behavior: "smooth", block: "center" });

    // Highlight temporarily
    const originalBorder = el.style.border;
    el.style.border = "2px solid yellow";
    setTimeout(() => (el.style.border = originalBorder), 1000);

    // Execute Action
    if (action === "CLICK") {
      el.click();
    } else if (action === "TYPE") {
      if (
        el.tagName.toLowerCase() === "input" ||
        el.tagName.toLowerCase() === "textarea"
      ) {
        // React 16+ Hack: React overrides the value setter, so simply setting .value doesn't trigger onChange.
        // We must call the native setter on the prototype.
        const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
          window.HTMLInputElement.prototype,
          "value",
        ).set;

        const nativeTextAreaValueSetter = Object.getOwnPropertyDescriptor(
          window.HTMLTextAreaElement.prototype,
          "value",
        ).set;

        const setter =
          el.tagName.toLowerCase() === "textarea"
            ? nativeTextAreaValueSetter
            : nativeInputValueSetter;

        if (setter) {
          setter.call(el, value || "");
        } else {
          el.value = value || "";
        }

        el.dispatchEvent(new Event("input", { bubbles: true }));
        el.dispatchEvent(new Event("change", { bubbles: true }));
      } else {
        // ContentEditable fallback
        el.focus();
        document.execCommand("insertText", false, value || "");
      }
    } else if (action === "HOVER") {
      el.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    } else if (action === "ASSERT") {
      // ASSERT logic: Check if element value/text matches expected value
      // If value is '*', just check existence (already done by getElement)
      if (value && value !== "*") {
        const text = el.innerText || el.textContent || el.value || "";
        if (!text.includes(value)) {
          throw new Error(
            `Assertion Failed: Expected text "${value}" in element [${id}], found "${text.substring(0, 50)}..."`,
          );
        }
      }
      // Highlight green for success
      const originalBorder = el.style.border;
      el.style.border = "2px solid green";
      setTimeout(() => (el.style.border = originalBorder), 1000);
    }
  };
})();
