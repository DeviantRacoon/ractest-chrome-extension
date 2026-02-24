import {
  Download,
  HelpCircle,
  Languages,
  Moon,
  Palette,
  Save,
  Sun,
  Timer,
  Trash2,
  Upload,
} from "lucide-react";
import React from "react";
import {
  Button,
  Card,
  ConfirmationModal,
  Input,
  Select,
} from "../../commons/components/ui";
import { useI18n } from "../../commons/i18n";
import type { AppLanguagePreference } from "../../commons/types";
import { AboutPrivacyModal } from "./components/AboutPrivacyModal";
import type { useSettings } from "./hooks/useSettings";

type SettingsViewProps = ReturnType<typeof useSettings>;

export const SettingsView: React.FC<SettingsViewProps> = (settingsProps) => {
  const { t, systemLanguage, setLanguage } = useI18n();
  const {
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
  } = settingsProps;
  if (loading || !settings) {
    return (
      <div className="flex justify-center py-12">
        <div className="w-8 h-8 border-2 rounded-full animate-spin border-accent-primary border-t-transparent"></div>
      </div>
    );
  }

  return (
    <div className="relative flex flex-col h-full bg-bg-main">
      {/* Sticky Header */}
      <div className="sticky top-0 z-20 flex items-center justify-between px-4 py-4 border-b bg-bg-main/95 backdrop-blur supports-[backdrop-filter]:bg-bg-main/60 border-border-default">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10">
            <img
              src="/icon.webp"
              alt="RacTest Icon"
              className="object-contain w-full h-full drop-shadow-md"
            />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-text-primary">
              {t("settings.title")}
            </h1>
            <p className="text-xs font-medium text-text-muted mt-0.5">
              {t("settings.subtitle")}
            </p>
          </div>
        </div>
        <Button
          variant="primary"
          size="sm"
          onClick={handleSave}
          loading={saving}
          className="shadow-lg shadow-accent-primary/20"
        >
          <Save className="w-4 h-4 mr-1.5" />
          {t("settings.save")}
        </Button>
      </div>

      {/* Content */}
      <div className="flex-1 p-4 pb-20 space-y-6 overflow-y-auto overflow-x-hidden">
        {/* Branding Card */}
        <div className="flex flex-col items-center justify-center py-6 animate-fade-in">
          <img
            src="/logotipo.webp"
            alt="RacTest Logotipo"
            className="object-contain w-auto h-12 transition-opacity duration-300 opacity-90 hover:opacity-100"
          />
          <p className="mt-2 text-xs font-medium text-text-muted">
            {t("settings.version", { version: "1.5.0" })}
          </p>
        </div>

        {/* General Settings */}
        <section className="space-y-3">
          <h3 className="ml-1 text-sm font-medium text-accent-primary/90">
            {t("settings.section.general")}
          </h3>
          <Card className="p-5 transition-colors bg-bg-card/40 backdrop-blur-sm border-border-default/50 hover:border-accent-primary/20">
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              <div className="space-y-4">
                <Input
                  label={t("settings.defaultDelay")}
                  type="number"
                  value={settings.defaultDelay}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    updateSetting("defaultDelay", parseInt(e.target.value) || 0)
                  }
                  min={0}
                  step={100}
                  leftIcon={<Timer className="w-4 h-4 text-text-muted" />}
                  fullWidth
                  className="transition-all bg-bg-main/50 border-border-default/50 focus:bg-bg-card"
                />
                <Input
                  label={t("settings.finalValidationDelay")}
                  type="number"
                  value={settings.finalValidationDelay ?? 3500}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    updateSetting(
                      "finalValidationDelay",
                      parseInt(e.target.value) || 0,
                    )
                  }
                  min={0}
                  step={100}
                  helperText={t("settings.finalValidationDelay.helper")}
                  leftIcon={<Timer className="w-4 h-4 text-text-muted" />}
                  fullWidth
                  className="transition-all bg-bg-main/50 border-border-default/50 focus:bg-bg-card"
                />
              </div>

              <div>
                <label className="block mb-2 text-sm font-medium text-text-secondary">
                  {t("settings.theme")}
                </label>
                <div className="flex flex-wrap border bg-bg-main/50 p-1.5 rounded-xl border-border-default/50">
                  <button
                    onClick={() => updateSetting("theme", "dark")}
                    className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium transition-all duration-300 ${
                      settings.theme === "dark"
                        ? "bg-bg-card text-text-primary shadow-sm ring-1 ring-border-default/50"
                        : "text-text-muted hover:text-text-secondary"
                    }`}
                  >
                    <Moon className="w-4 h-4" />
                    {t("settings.theme.dark")}
                  </button>
                  <button
                    onClick={() => updateSetting("theme", "light")}
                    className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium transition-all duration-300 ${
                      settings.theme === "light"
                        ? "bg-bg-card text-text-primary shadow-sm ring-1 ring-border-default/50"
                        : "text-text-muted hover:text-text-secondary"
                    }`}
                  >
                    <Sun className="w-4 h-4" />
                    {t("settings.theme.light")}
                  </button>
                </div>
              </div>

              <div>
                <Select
                  label={t("settings.language")}
                  value={settings.language}
                  onChange={(value) => {
                    const nextLanguage = value as AppLanguagePreference;
                    void setLanguage(nextLanguage);
                    updateSetting("language", nextLanguage);
                  }}
                  options={[
                    { value: "auto", label: t("settings.language.auto") },
                    { value: "en", label: t("settings.language.en") },
                    { value: "es", label: t("settings.language.es") },
                  ]}
                  helperText={`${t("settings.language.system", {
                    language:
                      systemLanguage === "es"
                        ? t("settings.language.es")
                        : t("settings.language.en"),
                  })} ${t("settings.language.helper")}`}
                  leftIcon={<Languages className="w-4 h-4 text-text-muted" />}
                  fullWidth
                  className="transition-all bg-bg-main/50 border-border-default/50 focus:bg-bg-card"
                />
              </div>
            </div>
          </Card>
        </section>

        {/* AI Assistant Settings */}
        <section className="space-y-3">
          <h3 className="ml-1 text-sm font-medium text-accent-primary/90">
            {t("settings.section.ai")}
          </h3>
          <Card className="p-5 transition-colors bg-bg-card/40 backdrop-blur-sm border-border-default/50 hover:border-accent-primary/20">
            <div className="space-y-4">
              <div>
                <label className="block mb-2 text-sm font-medium text-text-secondary">
                  {t("settings.aiTesting.label")}
                </label>
                <div className="flex flex-wrap border bg-bg-main/50 p-1.5 rounded-xl border-border-default/50">
                  <button
                    onClick={() => updateSetting("enableAiForTesting", true)}
                    className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all duration-300 ${
                      settings.enableAiForTesting !== false
                        ? "bg-bg-card text-text-primary shadow-sm ring-1 ring-border-default/50"
                        : "text-text-muted hover:text-text-secondary"
                    }`}
                  >
                    {t("settings.aiTesting.enabled")}
                  </button>
                  <button
                    onClick={() => updateSetting("enableAiForTesting", false)}
                    className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all duration-300 ${
                      settings.enableAiForTesting === false
                        ? "bg-bg-card text-text-primary shadow-sm ring-1 ring-border-default/50"
                        : "text-text-muted hover:text-text-secondary"
                    }`}
                  >
                    {t("settings.aiTesting.disabled")}
                  </button>
                </div>
                <p className="mt-2 text-xs text-text-muted">
                  {t("settings.aiTesting.helper")}
                </p>
              </div>

              <Input
                label={t("settings.apiKey.label")}
                type="password"
                value={settings.openRouterApiKey || ""}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  updateSetting("openRouterApiKey", e.target.value)
                }
                placeholder="sk-or-..."
                fullWidth
                className="transition-all bg-bg-main/50 border-border-default/50 focus:bg-bg-card"
                helperText={t("settings.apiKey.helper")}
                error={
                  settings.openRouterApiKey &&
                  !settings.openRouterApiKey.startsWith("sk-or-") &&
                  settings.openRouterApiKey !== "(Hidden for security)"
                    ? t("settings.apiKey.error")
                    : undefined
                }
              />

              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <div className="md:col-span-2">
                  <div className="flex items-center gap-2 mb-2">
                    <label className="text-sm font-medium text-text-secondary">
                      {t("settings.aiModel")}
                    </label>
                    <div className="relative group">
                      <button
                        type="button"
                        aria-label={t("settings.aiModel.recommended.aria")}
                        className="inline-flex items-center justify-center w-5 h-5 transition-colors border rounded-full text-text-muted border-border-default/60 bg-bg-main/60 hover:text-accent-primary hover:border-accent-primary/40 focus:outline-none focus:ring-2 focus:ring-accent-primary/40"
                      >
                        <HelpCircle className="w-3.5 h-3.5" />
                      </button>
                      <div className="absolute z-30 w-[min(20rem,calc(100vw-3rem))] p-3 text-xs transition-all duration-200 border rounded-xl shadow-xl pointer-events-none opacity-0 left-0 top-[calc(100%+10px)] translate-y-1 bg-bg-card/95 backdrop-blur-md border-border-default/70 text-text-secondary group-hover:opacity-100 group-hover:translate-y-0 group-focus-within:opacity-100 group-focus-within:translate-y-0">
                        <p className="mb-2 text-[11px] font-semibold tracking-wide uppercase text-accent-primary/90">
                          {t("settings.aiModel.recommended.title")}
                        </p>
                        <ul className="space-y-1.5 leading-relaxed break-words">
                          <li>{t("settings.aiModel.recommended.auto")}</li>
                          <li>{t("settings.aiModel.recommended.free")}</li>
                          <li>{t("settings.aiModel.recommended.stable1")}</li>
                          <li>{t("settings.aiModel.recommended.stable2")}</li>
                        </ul>
                      </div>
                    </div>
                  </div>
                  <Input
                    value={settings.aiModel ?? ""}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      updateSetting("aiModel", e.target.value)
                    }
                    placeholder={t("settings.aiModel.placeholder")}
                    fullWidth
                    className="transition-all bg-bg-main/50 border-border-default/50 focus:bg-bg-card"
                    helperText={t("settings.aiModel.helper")}
                  />
                </div>
                <div>
                  <Input
                    label={t("settings.aiMaxTokens")}
                    type="number"
                    value={settings.aiMaxTokens || 4096}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      updateSetting(
                        "aiMaxTokens",
                        parseInt(e.target.value) || 4096,
                      )
                    }
                    min={100}
                    max={128000}
                    step={100}
                    fullWidth
                    className="transition-all bg-bg-main/50 border-border-default/50 focus:bg-bg-card"
                    helperText={t("settings.aiMaxTokens.helper")}
                  />
                </div>
                <div>
                  <Input
                    label={t("settings.agentMaxSteps")}
                    type="number"
                    value={settings.agentMaxSteps || 20}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      updateSetting(
                        "agentMaxSteps",
                        parseInt(e.target.value) || 20,
                      )
                    }
                    min={5}
                    max={50}
                    step={1}
                    fullWidth
                    className="transition-all bg-bg-main/50 border-border-default/50 focus:bg-bg-card"
                    helperText={t("settings.agentMaxSteps.helper")}
                  />
                </div>
                <div>
                  <Input
                    label={t("settings.maxRetriesNonCritical")}
                    type="number"
                    value={settings.maxRetriesNonCritical ?? 0}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      updateSetting(
                        "maxRetriesNonCritical",
                        Math.max(0, Math.min(3, parseInt(e.target.value) || 0)),
                      )
                    }
                    min={0}
                    max={3}
                    step={1}
                    fullWidth
                    className="transition-all bg-bg-main/50 border-border-default/50 focus:bg-bg-card"
                    helperText={t("settings.maxRetriesNonCritical.helper")}
                  />
                </div>
              </div>
              <div>
                <label className="block mb-2 text-sm font-medium text-text-secondary">
                  {t("settings.agentMode")}
                </label>
                <div className="flex flex-wrap border bg-bg-main/50 p-1.5 rounded-xl border-border-default/50">
                  <button
                    onClick={() =>
                      updateSetting("agentMode", "strict_fail_fast")
                    }
                    className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all duration-300 ${
                      (settings.agentMode || "strict_fail_fast") ===
                      "strict_fail_fast"
                        ? "bg-bg-card text-text-primary shadow-sm ring-1 ring-border-default/50"
                        : "text-text-muted hover:text-text-secondary"
                    }`}
                  >
                    {t("settings.agentMode.strict")}
                  </button>
                  <button
                    onClick={() => updateSetting("agentMode", "balanced")}
                    className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all duration-300 ${
                      settings.agentMode === "balanced"
                        ? "bg-bg-card text-text-primary shadow-sm ring-1 ring-border-default/50"
                        : "text-text-muted hover:text-text-secondary"
                    }`}
                  >
                    {t("settings.agentMode.balanced")}
                  </button>
                </div>
                <p className="mt-2 text-xs text-text-muted">
                  {t("settings.agentMode.help")}
                </p>
              </div>
              <div className="flex items-start gap-2 p-3 mt-2 text-xs border rounded-lg bg-accent-primary/10 border-accent-primary/20 text-text-secondary">
                <HelpCircle className="w-4 h-4 text-accent-primary mt-0.5 shrink-0" />
                <p>
                  <span className="font-semibold text-accent-primary">
                    {t("settings.note.title")}
                  </span>{" "}
                  {t("settings.note.body")}
                </p>
              </div>
            </div>
          </Card>
        </section>

        {/* Inspector Settings */}
        <section className="space-y-3">
          <h3 className="ml-1 text-sm font-medium text-accent-primary/90">
            {t("settings.section.inspector")}
          </h3>
          <Card className="p-5 transition-colors bg-bg-card/40 backdrop-blur-sm border-border-default/50 hover:border-accent-primary/20">
            <label className="block mb-4 text-sm font-medium text-text-secondary">
              {t("settings.highlightColor")}
            </label>
            <div className="flex flex-wrap items-center gap-4">
              {[
                "#10B981",
                "#3B82F6",
                "#8B5CF6",
                "#EC4899",
                "#F59E0B",
                "#EF4444",
              ].map((color) => (
                <button
                  key={color}
                  onClick={() => updateSetting("highlightColor", color)}
                  className={`relative w-8 h-8 rounded-full transition-all duration-300 group ${
                    settings.highlightColor === color
                      ? "scale-110 ring-2 ring-offset-2 ring-offset-bg-card"
                      : "hover:scale-110 opacity-80 hover:opacity-100"
                  }`}
                  style={{
                    backgroundColor: color,
                    borderColor:
                      settings.highlightColor === color ? color : "transparent",
                    boxShadow:
                      settings.highlightColor === color
                        ? `0 0 12px ${color}60`
                        : "none",
                  }}
                  title={color}
                >
                  {settings.highlightColor === color && (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="w-2 h-2 bg-white rounded-full shadow-sm" />
                    </div>
                  )}
                </button>
              ))}
              <div className="flex items-center gap-2 px-3 ml-auto border rounded-lg bg-bg-main/50 py-1.5 border-border-default/50">
                <Palette className="w-3.5 h-3.5 text-text-muted" />
                <span className="font-mono text-xs font-medium text-text-muted">
                  {settings.highlightColor}
                </span>
              </div>
            </div>
          </Card>
        </section>

        {/* Data Management */}
        <section className="space-y-3">
          <h3 className="ml-1 text-sm font-medium text-accent-primary/90">
            {t("settings.section.data")}
          </h3>
          <Card className="p-5 space-y-6 transition-colors bg-bg-card/40 backdrop-blur-sm border-border-default/50 hover:border-accent-primary/20">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Button
                variant="secondary"
                onClick={handleExportData}
                fullWidth
                className="bg-bg-main/50 hover:bg-bg-main/80 border-border-default/50 h-11"
              >
                <Download className="w-4 h-4 mr-2" />
                {t("settings.exportAll")}
              </Button>
              <div className="relative">
                <input
                  type="file"
                  accept=".json"
                  onChange={handleImportData}
                  className="absolute inset-0 z-10 w-full h-full opacity-0 cursor-pointer"
                  disabled={importing}
                />
                <Button
                  variant="secondary"
                  fullWidth
                  loading={importing}
                  className="bg-bg-main/50 hover:bg-bg-main/80 border-border-default/50 h-11"
                >
                  <Upload className="w-4 h-4 mr-2" />
                  {t("settings.importData")}
                </Button>
              </div>
            </div>

            <div className="pt-6 border-t border-border-default/30">
              <Button
                variant="ghost"
                fullWidth
                onClick={handleClearAllDataRequest}
                className="justify-start h-auto px-2 py-2 text-status-error hover:bg-status-error/10 hover:text-status-error"
              >
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-status-error/10">
                    <Trash2 className="w-4 h-4" />
                  </div>
                  <div className="text-left">
                    <div className="text-sm font-medium">
                      {t("settings.resetAll")}
                    </div>
                    <div className="font-normal text-[10px] opacity-80">
                      {t("settings.resetAll.desc")}
                    </div>
                  </div>
                </div>
              </Button>
            </div>
          </Card>
        </section>
      </div>

      <ConfirmationModal
        isOpen={clearDataModalOpen}
        title={t("settings.confirmReset.title")}
        message={t("settings.confirmReset.message")}
        confirmText={t("settings.confirmReset.confirm")}
        cancelText={t("settings.confirmReset.cancel")}
        onConfirm={handleConfirmClearAllData}
        onCancel={() => setClearDataModalOpen(false)}
        variant="danger"
      />

      <AboutPrivacyModal
        isOpen={settingsProps.aboutModalOpen}
        onClose={() => settingsProps.setAboutModalOpen(false)}
      />

      <div className="absolute bottom-4 right-4 animate-fade-in">
        <button
          onClick={() => settingsProps.setAboutModalOpen(true)}
          className="p-2 transition-colors border border-transparent rounded-full shadow-sm text-text-muted hover:text-accent-primary bg-bg-card/50 hover:bg-bg-card backdrop-blur-sm hover:border-accent-primary/20"
          title={t("settings.about.title")}
        >
          <HelpCircle className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
};
