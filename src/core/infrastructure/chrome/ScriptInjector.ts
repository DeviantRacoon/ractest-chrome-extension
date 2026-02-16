export function injectConsoleInterceptor(tabId: number) {
  chrome.scripting
    .executeScript({
      target: { tabId },
      world: "MAIN",
      func: () => {
        if ((window as any).__racTestInterceptorInjected) return;
        (window as any).__racTestInterceptorInjected = true;

        const originalConsole = { ...console };

        function intercept(level: string) {
          return function (...args: any[]) {
            if ((originalConsole as any)[level]) {
              (originalConsole as any)[level].apply(console, args);
            }

            try {
              const messageParts = args.map((arg) => {
                if (arg === null) return "null";
                if (arg === undefined) return "undefined";
                if (typeof arg === "string") return arg;
                if (arg instanceof Error) return arg.toString();
                if (typeof arg === "object") {
                  try {
                    return JSON.stringify(arg);
                  } catch (e) {
                    return "[Circular/Object]";
                  }
                }
                return String(arg);
              });

              const message = messageParts.join(" ");

              // Heuristic: Upgrade "log" to "error" if message contains error keywords
              if (
                level === "log" &&
                (typeof message === "string" ? message : "").match(
                  /error|exception|fail|failed|uncaught/i,
                )
              ) {
                level = "error";
              }

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
            } catch (err) {}
          };
        }

        ["log", "info", "warn", "error", "debug"].forEach((level) => {
          if ((console as any)[level]) {
            (console as any)[level] = intercept(level);
          }
        });

        window.addEventListener("error", function (event) {
          window.postMessage(
            {
              source: "RACTEST_CONSOLE_LOG",
              payload: {
                timestamp: Date.now(),
                level: "error",
                message: event.message || "Unknown Error",
                stack: event.error ? event.error.stack : null,
              },
            },
            "*",
          );
        });

        window.addEventListener("unhandledrejection", function (event) {
          window.postMessage(
            {
              source: "RACTEST_CONSOLE_LOG",
              payload: {
                timestamp: Date.now(),
                level: "error",
                message:
                  "Unhandled Promise Rejection: " +
                  (event.reason
                    ? event.reason.message || event.reason
                    : "Unknown"),
                stack: event.reason ? event.reason.stack : null,
              },
            },
            "*",
          );
        });

        // Network Interception (Fetch)
        const originalFetch = window.fetch;
        window.fetch = async function (...args) {
          try {
            const response = await originalFetch.apply(this, args);
            // Capture if status is not OK (>= 400) OR if type is opaque (0) which might hide errors
            if (
              (!response.ok && response.status >= 400) ||
              response.type === "opaque"
            ) {
              let errorDetails = "";
              try {
                const clone = response.clone();
                const body = await clone.text();
                errorDetails = body ? ` | Body: ${body.substring(0, 300)}` : "";
              } catch (e) {
                // Ignore
              }

              window.postMessage(
                {
                  source: "RACTEST_CONSOLE_LOG",
                  payload: {
                    timestamp: Date.now(),
                    level: "error",
                    message: `Method: FETCH | URL: ${response.url} | Status: ${response.status} (${response.statusText})${errorDetails}`,
                  },
                },
                "*",
              );
            }
            return response;
          } catch (e) {
            window.postMessage(
              {
                source: "RACTEST_CONSOLE_LOG",
                payload: {
                  timestamp: Date.now(),
                  level: "error",
                  message: `Method: FETCH | URL: ${args[0] ? String(args[0]) : "unknown"} | Error: ${String(e)}`,
                },
              },
              "*",
            );
            throw e;
          }
        };

        // Network Interception (XHR)
        const originalOpen = XMLHttpRequest.prototype.open;
        const originalSend = XMLHttpRequest.prototype.send;

        XMLHttpRequest.prototype.open = function (
          method: string,
          url: string | URL,
        ) {
          (this as any)._rac_url = url;
          (this as any)._rac_method = method;
          return originalOpen.apply(this, arguments as any);
        };

        XMLHttpRequest.prototype.send = function () {
          this.addEventListener("loadend", function () {
            // Capture 4xx, 5xx, or 0 (network error/opaque)
            if (this.status >= 400 || this.status === 0) {
              let responseBody = "";
              try {
                if (this.responseType === "" || this.responseType === "text") {
                  responseBody = this.responseText
                    ? ` | Body: ${this.responseText.substring(0, 300)}`
                    : "";
                } else if (this.responseType === "json" && this.response) {
                  responseBody = ` | Body: ${JSON.stringify(this.response).substring(0, 300)}`;
                }
              } catch (e) {
                // Ignore
              }

              window.postMessage(
                {
                  source: "RACTEST_CONSOLE_LOG",
                  payload: {
                    timestamp: Date.now(),
                    level: "error",
                    message: `Method: XHR | URL: ${(this as any)._rac_url} | Status: ${this.status} (${this.statusText})${responseBody}`,
                  },
                },
                "*",
              );
            }
          });
          return originalSend.apply(this, arguments as any);
        };

        console.info("[RacTest] Console interceptor injected via Background");
      },
    })
    .catch((err) => console.error("Failed to inject console interceptor", err));
}

export function injectErrorMonitor(tabId: number) {
  chrome.scripting
    .executeScript({
      target: { tabId },
      world: "MAIN",
      func: () => {
        if ((window as any).__RAC_MONITOR_INJECTED__) return;
        (window as any).__RAC_MONITOR_INJECTED__ = true;

        function sendToContentScript(subtype: string, payload: unknown) {
          window.postMessage(
            {
              type: "RAC_CAPTURED_ERROR",
              subtype,
              payload,
              timestamp: Date.now(),
            },
            "*",
          );
        }

        window.addEventListener("error", (event) => {
          sendToContentScript("WINDOW", event.message || "Unknown error");
        });

        window.addEventListener("unhandledrejection", (event) => {
          sendToContentScript(
            "PROMISE",
            event.reason ? String(event.reason) : "Unknown reason",
          );
        });

        const originalFetch = window.fetch;
        window.fetch = async function (...args) {
          try {
            const response = await originalFetch.apply(this, args);
            if (!response.ok && response.status >= 400) {
              sendToContentScript("NETWORK", {
                method: "FETCH",
                url: response.url,
                status: response.status,
                statusText: response.statusText,
              });
            }
            return response;
          } catch (e) {
            sendToContentScript("NETWORK", {
              method: "FETCH",
              url: args[0] ? String(args[0]) : "unknown",
              error: String(e),
            });
            throw e;
          }
        };

        const originalOpen = XMLHttpRequest.prototype.open;
        const originalSend = XMLHttpRequest.prototype.send;

        XMLHttpRequest.prototype.open = function (
          method: string,
          url: string | URL,
        ) {
          (this as any)._rac_url = url;
          (this as any)._rac_method = method;
          return originalOpen.apply(this, arguments as any);
        };

        XMLHttpRequest.prototype.send = function () {
          this.addEventListener("loadend", function () {
            if (this.status >= 400) {
              sendToContentScript("NETWORK", {
                method: "XHR",
                url: (this as any)._rac_url,
                status: this.status,
                statusText: this.statusText,
              });
            }
          });
          return originalSend.apply(this, arguments as any);
        };

        console.log("[RacTest Monitor] Passive error monitoring active.");
      },
    })
    .catch((err) => console.error("Failed to inject error monitor", err));
}
