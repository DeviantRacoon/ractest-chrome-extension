(function () {
  if (window.__racTestInterceptorInjected) return;
  window.__racTestInterceptorInjected = true;

  const originalConsole = { ...console };

  function intercept(level) {
    return function (...args) {
      // Call original console method to ensure developer experience isn't broken
      if (originalConsole[level]) {
        originalConsole[level].apply(console, args);
      }

      try {
        // Serialize arguments safely
        const messageParts = args.map((arg) => {
          if (arg === null) return "null";
          if (arg === undefined) return "undefined";
          if (typeof arg === "string") return arg;
          if (arg instanceof Error) return arg.toString();
          if (typeof arg === "object") {
            try {
              return JSON.stringify(arg);
            } catch (e) {
              return "[Circular/Unserializable Object]";
            }
          }
          return String(arg);
        });

        const message = messageParts.join(" ");

        // Send to content script
        window.postMessage(
          {
            source: "RACTEST_CONSOLE_LOG",
            payload: {
              timestamp: Date.now(),
              level,
              message,
            },
          },
          "*",
        );
      } catch (err) {
        // Prevent infinite loops if logging fails
      }
    };
  }

  ["log", "info", "warn", "error", "debug"].forEach((level) => {
    // Only intercept if the method exists
    if (console[level]) {
      console[level] = intercept(level);
    }
  });

  console.info("[RacTest] Console interceptor active");
})();
