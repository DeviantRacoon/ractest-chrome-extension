import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useI18n } from "../../../commons/i18n";
import { useToast } from "../../../commons/components/ui";
import storageService from "../../../commons/lib/storage";
import { agentService } from "../../../core/container";
import type { IAgentLog } from "../../../core/domain/interfaces";

export const useAutopilot = () => {
  const navigate = useNavigate();
  const { error } = useToast();
  const { t } = useI18n();
  const [url, setUrl] = useState("https://google.com");
  const [goal, setGoal] = useState("");
  const [isRunning, setIsRunning] = useState(false);
  const [logs, setLogs] = useState<IAgentLog[]>([]);
  const [hasApiKey, setHasApiKey] = useState<boolean | null>(null);
  const [readingMode, setReadingMode] = useState<"fast" | "normal" | "complex">(
    "normal",
  );

  // Check for API Key on mount
  useEffect(() => {
    const checkApiKey = async () => {
      const settings = await storageService.getSettings();
      setHasApiKey(!!settings.openRouterApiKey);
      // Load preference from settings (it might have been changed in global settings)
      if (settings.readingMode) setReadingMode(settings.readingMode);
    };
    checkApiKey();
  }, []);

  // Check initial state
  useEffect(() => {
    if (agentService.isRunning()) {
      setIsRunning(true);
      // Note: We can't recover previous logs from the service currently,
      // so we start fresh or would need to refactor AgentService to store them.
      // For now, we just subscribe to new ones.
    }

    // Subscribe to logs
    agentService.setLogCallback((log) => {
      setLogs((prev) => [...prev, log]);
      if (
        log.message.includes("Agent finished") ||
        log.message.includes("Agent stopped")
      ) {
        setIsRunning(false);
      }
    });

    return () => {
      // We don't stop the agent on unmount, but we stop listening?
      // Actually, if we leave the page, we might want to keep it running in background?
      // But we lose the UI update.
      // For this generic implementation, we'll leave the callback active but
      // since the component unmounts, the state setters won't work.
      // Ideally AgentService should allow multiple listeners or we handle this better.
      // We will set callback to null to avoid memory leaks calling setState of unmounted component.
      // agentService.setLogCallback(() => {}); // This would break background run if we navigated away.
      // Let's assume user stays on page.
    };
  }, []);

  const handleRun = async () => {
    if (!url || !goal) return;

    // Failsafe check
    const settings = await storageService.getSettings();
    if (!settings.openRouterApiKey) {
      error(t("autopilot.toast.noApiKey"));
      setHasApiKey(false);
      return;
    }

    setLogs([]);
    setIsRunning(true);

    try {
      // Check if we need to open the tab
      if (typeof chrome !== "undefined" && chrome.tabs && chrome.tabs.create) {
        // Query current tab first
        const [currentTab] = await chrome.tabs.query({
          active: true,
          currentWindow: true,
        });
        const currentUrl = currentTab?.url || "";

        // Normalize URLs (basic)
        const normalize = (u: string) => u.replace(/\/$/, "").toLowerCase();

        if (normalize(currentUrl) === normalize(url)) {
          // Already on the right page, just ensure it's focused (it is, since we queried active)
          // No op, just proceed
          console.log("Already on target URL, reusing tab.");
        } else {
          // Create new tab
          await chrome.tabs.create({ url, active: true });
          // Wait for load
          await new Promise((r) => setTimeout(r, 2000));
        }
      }

      const profileId = "autopilot_session_" + Date.now();
      await agentService.start(goal, profileId);
    } catch (error) {
      console.error("Failed to start agent:", error);
      setIsRunning(false);
      setLogs((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          timestamp: Date.now(),
          type: "error",
          message: "Failed to start: " + String(error),
        },
      ]);
    }
  };

  const handleStop = () => {
    agentService.stop();
    setIsRunning(false);
  };

  const handleGetCurrentUrl = async () => {
    if (typeof chrome !== "undefined" && chrome.tabs && chrome.tabs.query) {
      try {
        const [tab] = await chrome.tabs.query({
          active: true,
          currentWindow: true,
        });
        if (tab?.url) {
          setUrl(tab.url);
        }
      } catch (error) {
        console.error("Error getting current URL:", error);
      }
    }
  };

  const updateReadingMode = (mode: "fast" | "normal" | "complex") => {
    setReadingMode(mode);
    storageService.updateSettings({ readingMode: mode });
  };

  return {
    url,
    setUrl,
    goal,
    setGoal,
    isRunning,
    logs,
    setLogs, // Exposed for clearing logs
    hasApiKey,
    readingMode,
    setReadingMode: updateReadingMode, // Wrapped to update storage automatically
    handleRun,
    handleStop,
    handleGetCurrentUrl,
    navigate,
  };
};
