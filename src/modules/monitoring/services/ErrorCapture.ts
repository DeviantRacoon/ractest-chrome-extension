/**
 * Injects a script into the main page context to capture errors and network events.
 * This is necessary because content scripts run in an isolated world and cannot see
 * console logs or monkey-patch window objects of the main page.
 */
export function injectErrorCapture() {
  const scriptContent = `
    (function() {
      // Prevent multiple injections
      if (window.__RAC_MONITOR_INJECTED__) return;
      window.__RAC_MONITOR_INJECTED__ = true;

      function sendToContentScript(subtype, payload) {
        window.postMessage({
          type: 'RAC_CAPTURED_ERROR',
          subtype: subtype,
          payload: payload,
          timestamp: Date.now()
        }, '*');
      }

      // 1. Capture Console Errors
      const originalConsoleError = console.error;
      console.error = function(...args) {
        sendToContentScript('CONSOLE', args.map(a => String(a)).join(' '));
        originalConsoleError.apply(console, args);
      };

      // 2. Capture Unhandled Exceptions
      window.addEventListener('error', (event) => {
        sendToContentScript('WINDOW', event.message || 'Unknown error');
      });

      // 3. Capture Unhandled Promise Rejections
      window.addEventListener('unhandledrejection', (event) => {
        sendToContentScript('PROMISE', event.reason ? String(event.reason) : 'Unknown reason');
      });

      // 4. Capture Network Errors (Fetch)
      const originalFetch = window.fetch;
      window.fetch = async function(...args) {
        try {
          const response = await originalFetch.apply(this, args);
          if (!response.ok && response.status >= 400) {
            sendToContentScript('NETWORK', {
              method: 'FETCH',
              url: response.url,
              status: response.status,
              statusText: response.statusText
            });
          }
          return response;
        } catch (e) {
          sendToContentScript('NETWORK', {
            method: 'FETCH',
            url: args[0] ? String(args[0]) : 'unknown',
            error: String(e)
          });
          throw e;
        }
      };

      // 5. Capture Network Errors (XHR)
      const originalOpen = XMLHttpRequest.prototype.open;
      const originalSend = XMLHttpRequest.prototype.send;

      XMLHttpRequest.prototype.open = function(method, url) {
        this._rac_url = url;
        this._rac_method = method;
        return originalOpen.apply(this, arguments);
      };

      XMLHttpRequest.prototype.send = function() {
        this.addEventListener('loadend', function() {
          if (this.status >= 400) {
             sendToContentScript('NETWORK', {
              method: 'XHR',
              url: this._rac_url,
              status: this.status,
              statusText: this.statusText
            });
          }
        });
        return originalSend.apply(this, arguments);
      };

      console.log("[RacTest Monitor] Passive error monitoring active.");
    })();
  `;

  const script = document.createElement("script");
  script.textContent = scriptContent;
  (document.head || document.documentElement).appendChild(script);
  script.remove(); // Clean up the tag, code remains in memory
}
