import { useEffect, useState } from "react";
import { useToast } from "../../../commons/components/ui";
import storageService from "../../../commons/lib/storage";
import { applyThemeToDocument } from "../../../commons/lib/theme";
import type { TestProfile, UserSettings } from "../../../commons/types";
import { useI18n } from "../../../commons/i18n";

export const useSettings = () => {
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const [clearDataModalOpen, setClearDataModalOpen] = useState(false);

  const { success, error } = useToast();
  const { t } = useI18n();

  useEffect(() => {
    loadSettings();
  }, []);

  // Apply theme effect
  useEffect(() => {
    if (!settings?.theme) return;
    applyThemeToDocument(settings.theme);
  }, [settings?.theme]);

  const API_KEY_MASK = "(Hidden for security)";

  const loadSettings = async () => {
    setLoading(true);
    try {
      const data = await storageService.getSettings();
      // Mask API Key in UI if present
      if (data.openRouterApiKey) {
        data.openRouterApiKey = API_KEY_MASK;
      }
      setSettings(data);
    } catch (err) {
      console.error("Error loading settings:", err);
      error(t("toast.settings.loadError"));
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!settings) return;
    setSaving(true);
    try {
      // Create a copy to modify for saving
      const settingsToSave = { ...settings };

      // If the key is the mask, don't update it (keep existing value in storage)
      if (settingsToSave.openRouterApiKey === API_KEY_MASK) {
        delete settingsToSave.openRouterApiKey;
      }

      await storageService.updateSettings(settingsToSave);
      // Show success feedback
      success(t("toast.settings.saved"));
      setTimeout(() => setSaving(false), 500);
    } catch (err) {
      console.error("Error saving settings:", err);
      error(t("toast.settings.saveError"));
      setSaving(false);
    }
  };

  const updateSetting = <K extends keyof UserSettings>(
    key: K,
    value: UserSettings[K],
  ) => {
    if (!settings) return;
    if (key === "theme" && (value === "dark" || value === "light")) {
      applyThemeToDocument(value);
      void storageService.updateSettings({ theme: value }).catch((err) => {
        console.error("Error persisting theme:", err);
        error(t("toast.settings.themeError"));
      });
    }
    setSettings({ ...settings, [key]: value });
  };

  const handleExportData = async () => {
    try {
      const profiles = await storageService.getProfiles();
      const history = await storageService.getHistory();
      const exportSettings = settings ? { ...settings } : undefined;
      if (exportSettings?.openRouterApiKey === API_KEY_MASK) {
        delete exportSettings.openRouterApiKey;
      }

      const exportData = {
        profiles,
        history,
        settings: exportSettings,
        version: "1.0",
        exportDate: new Date().toISOString(),
      };

      const blob = new Blob([JSON.stringify(exportData, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `ractest-backup-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      success(t("toast.export.success"));
    } catch (err) {
      console.error("Error exporting data:", err);
      error(t("toast.export.error"));
    }
  };

  const handleImportData = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!window.confirm(t("toast.import.confirm"))) {
      e.target.value = "";
      return;
    }

    setImporting(true);
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const json = event.target?.result as string;
        const data = JSON.parse(json);

        let profileStats = { imported: 0, updated: 0, created: 0 };

        if (data.profiles && Array.isArray(data.profiles)) {
          profileStats = await storageService.importProfiles(
            data.profiles as TestProfile[],
          );
        }

        if (data.history && Array.isArray(data.history)) {
          await storageService.replaceHistory(data.history);
        }

        if (data.settings) {
          const importedSettings = { ...(data.settings as UserSettings) };
          if (importedSettings.openRouterApiKey === API_KEY_MASK) {
            delete importedSettings.openRouterApiKey;
          }
          await storageService.updateSettings(importedSettings);
        }

        await loadSettings();
        success(
          t("toast.import.success", {
            imported: profileStats.imported,
            created: profileStats.created,
            updated: profileStats.updated,
          }),
        );
      } catch (err) {
        console.error("Error details:", err);
        error(t("toast.import.error"));
      } finally {
        setImporting(false);
        e.target.value = "";
      }
    };
    reader.readAsText(file);
  };

  const handleClearAllDataRequest = () => {
    setClearDataModalOpen(true);
  };

  const handleConfirmClearAllData = async () => {
    try {
      await storageService.clearAllData();
      // Reload to reset state
      window.location.reload();
    } catch (err) {
      console.error("Error clearing all data:", err);
      error(t("toast.reset.error"));
      setClearDataModalOpen(false);
    }
  };

  return {
    settings,
    loading,
    saving,
    importing,
    clearDataModalOpen,
    setClearDataModalOpen,
    handleSave,
    updateSetting,
    handleExportData,
    handleImportData,
    handleClearAllDataRequest,
    handleConfirmClearAllData,
  };
};
