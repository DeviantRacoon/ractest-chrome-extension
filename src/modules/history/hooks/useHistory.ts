import { useEffect, useState } from "react";
import { useI18n } from "../../../commons/i18n";
import { useToast } from "../../../commons/components/ui";
import storageService from "../../../commons/lib/storage";
import type { RecipeExecutionResult } from "../../../commons/types";

export const useHistory = () => {
  const [history, setHistory] = useState<RecipeExecutionResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [clearHistoryModalOpen, setClearHistoryModalOpen] = useState(false);

  const { success, error } = useToast();
  const { language, t } = useI18n();

  useEffect(() => {
    loadHistory();
  }, []);

  const loadHistory = async () => {
    setLoading(true);
    try {
      const data = await storageService.getHistory();
      setHistory(data);
    } catch (err) {
      console.error("Error loading history:", err);
      error(t("history.toast.loadError"));
    } finally {
      setLoading(false);
    }
  };

  const handleClearHistoryRequest = () => {
    setClearHistoryModalOpen(true);
  };

  const handleConfirmClearHistory = async () => {
    try {
      await storageService.clearHistory();
      setHistory([]);
      success(t("history.toast.cleared"));
    } catch (err) {
      console.error("Error clearing history:", err);
      error(t("history.toast.clearError"));
    } finally {
      setClearHistoryModalOpen(false);
    }
  };

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleString(
      language === "es" ? "es-ES" : "en-US",
      {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      },
    );
  };

  const [selectedExecution, setSelectedExecution] =
    useState<RecipeExecutionResult | null>(null);

  const handleSelectExecution = (execution: RecipeExecutionResult) => {
    setSelectedExecution(execution);
  };

  const handleCloseDetails = () => {
    setSelectedExecution(null);
  };

  const formatDuration = (ms?: number) => {
    if (!ms) return "-";
    const seconds = Math.floor(ms / 1000);
    if (seconds < 60) return `${seconds}s`;
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}m ${secs}s`;
  };

  return {
    history,
    loading,
    clearHistoryModalOpen,
    setClearHistoryModalOpen,
    handleClearHistoryRequest,
    handleConfirmClearHistory,
    formatDate,
    formatDuration,
    selectedExecution,
    handleSelectExecution,
    handleCloseDetails,
  };
};
