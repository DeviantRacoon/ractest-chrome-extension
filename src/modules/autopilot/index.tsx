import {
  AlertTriangle,
  ArrowLeft,
  Bot,
  Brain,
  CheckCircle,
  ChevronRight,
  Globe,
  Link,
  MousePointer2,
  Play,
  Terminal,
  Type,
} from "lucide-react";
import React from "react";
import { useI18n } from "../../commons/i18n";
import { AgentStatusPanel } from "../../commons/components/AgentStatusPanel";
import { Button, Input } from "../../commons/components/ui";
import type { useAutopilot } from "./hooks/useAutopilot";

type AutopilotViewProps = ReturnType<typeof useAutopilot>;

export const AutopilotView: React.FC<AutopilotViewProps> = ({
  url,
  setUrl,
  goal,
  setGoal,
  isRunning,
  logs,
  setLogs,
  hasApiKey,
  handleRun,
  handleStop,
  handleGetCurrentUrl,
  navigate,
}) => {
  const { t } = useI18n();

  const skills = [
    {
      icon: MousePointer2,
      name: "Click",
      description: t("autopilot.skill.click.desc"),
    },
    { icon: Type, name: "Type", description: t("autopilot.skill.type.desc") },
    {
      icon: CheckCircle,
      name: "Assert",
      description: t("autopilot.skill.assert.desc"),
    },
    {
      icon: ChevronRight,
      name: "Select",
      description: t("autopilot.skill.select.desc"),
    },
    {
      icon: Globe,
      name: "Navigate",
      description: t("autopilot.skill.navigate.desc"),
    },
  ];

  return (
    <div className="flex flex-col h-full bg-bg-main relative">
      {/* Sticky Header */}
      <div className="sticky top-0 z-20 bg-bg-main/95 backdrop-blur supports-[backdrop-filter]:bg-bg-main/60 border-b border-border-default px-4 py-4 space-y-4">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate("/")}
            className="w-8 h-8 p-0 rounded-full hover:bg-bg-card -ml-2"
          >
            <ArrowLeft className="w-5 h-5 text-text-secondary" />
          </Button>
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500/20 to-purple-500/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
            <Bot className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-text-primary tracking-tight">
              Autopilot
            </h1>
            <p className="text-xs text-text-muted font-medium mt-0.5">
              {t("autopilot.subtitle")}
            </p>
          </div>
        </div>
        {hasApiKey === false && (
          <div className="flex items-center gap-2 p-2 px-3 bg-red-500/10 border border-red-500/20 rounded-lg">
            <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
            <p className="text-xs text-red-200">
              {t("autopilot.apiKey.required")}{" "}
              <button
                onClick={() => navigate("/settings")}
                className="underline hover:text-red-100 font-medium"
              >
                {t("autopilot.apiKey.settings")}
              </button>{" "}
              {t("autopilot.apiKey.toConfigure")}
            </p>
          </div>
        )}
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-6 pb-20">
        {/* Helper Card */}
        <div className="bg-accent-primary/5 border border-accent-primary/10 rounded-xl p-4">
          <div className="flex gap-4">
            <div className="w-12 h-12 rounded-full bg-accent-primary/10 flex items-center justify-center shrink-0">
              <Brain className="w-6 h-6 text-accent-primary" />
            </div>
            <div className="space-y-1">
              <h3 className="text-sm font-semibold text-text-primary">
                {t("autopilot.helper.title")}
              </h3>
              <p className="text-xs text-text-muted leading-relaxed">
                {t("autopilot.helper.body")}
              </p>
            </div>
          </div>
        </div>

        {isRunning || logs.length > 0 ? (
          <div className="space-y-4 animate-fade-in">
            <div className="flex items-center justify-between pb-2 border-b border-border-default/50">
              <h2 className="text-sm font-semibold text-text-primary flex items-center gap-2">
                <Terminal className="w-4 h-4 text-accent-secondary" />
                {t("autopilot.live.title")}
              </h2>
              {isRunning && (
                <span className="flex items-center gap-1.5 text-[10px] font-medium text-emerald-400 bg-emerald-400/10 px-2 py-0.5 rounded-full ring-1 ring-emerald-400/20">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  {t("autopilot.running")}
                </span>
              )}
            </div>

            <AgentStatusPanel
              logs={logs}
              isRunning={isRunning}
              onStop={handleStop}
            />

            {!isRunning && logs.length > 0 && (
              <div className="flex justify-end pt-2">
                <Button variant="ghost" size="sm" onClick={() => setLogs([])}>
                  {t("autopilot.clearLogs")}
                </Button>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-8 animate-fade-in">
            {/* Configuration */}
            <div className="space-y-4">
              <h2 className="text-sm font-semibold text-text-primary border-l-2 border-accent-secondary pl-2">
                {t("autopilot.config.title")}
              </h2>

              <div className="space-y-4 bg-bg-card/50 rounded-xl p-4 border border-border-default/50">
                <div>
                  <label className="block text-xs font-medium text-text-secondary mb-1.5 ml-1">
                    {t("autopilot.startUrl")}
                  </label>
                  <div className="flex gap-2">
                    <div className="flex-1">
                      <Input
                        value={url}
                        onChange={(e) => setUrl(e.target.value)}
                        placeholder="https://example.com"
                        fullWidth
                        leftIcon={<Globe className="w-4 h-4 text-text-muted" />}
                      />
                    </div>
                    <Button
                      variant="secondary"
                      onClick={handleGetCurrentUrl}
                      title={t("autopilot.useCurrentUrl")}
                      className="px-3"
                    >
                      <Link className="w-4 h-4" />
                    </Button>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-text-secondary mb-1.5 ml-1">
                    {t("autopilot.goal")}
                  </label>
                  <div className="space-y-3">
                    <textarea
                      className="w-full bg-bg-main border border-border-default rounded-lg p-3 text-sm text-text-primary focus:ring-2 focus:ring-accent-primary/50 outline-none transition-all min-h-[100px] resize-none"
                      placeholder={t("autopilot.goalPlaceholder")}
                      value={goal}
                      onChange={(e) => setGoal(e.target.value)}
                    />
                    <div className="flex justify-end">
                      <Button
                        variant="primary"
                        onClick={handleRun}
                        disabled={!url || !goal || !hasApiKey}
                        title={
                          !hasApiKey
                            ? t("autopilot.run.needApiKey")
                            : t("autopilot.run.start")
                        }
                        className="shadow-lg shadow-indigo-500/20 bg-gradient-to-r from-indigo-500 to-purple-600 border-none text-white disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <Play className="w-4 h-4 mr-1.5 fill-current" />
                        {t("autopilot.run.start")}
                      </Button>
                    </div>
                  </div>
                </div>
                <div className="bg-bg-secondary/30 rounded-lg p-3 border border-border-default/30">
                  <p className="text-[11px] text-text-muted leading-relaxed">
                    {t("autopilot.adaptiveMode.desc")}
                  </p>
                </div>
              </div>
            </div>

            {/* Skills Section */}
            <div className="space-y-4">
              <h2 className="text-sm font-semibold text-text-primary border-l-2 border-accent-secondary pl-2">
                {t("autopilot.skills.title")}
              </h2>
              <div className="grid grid-cols-1 gap-3">
                {skills.map((skill) => {
                  const Icon = skill.icon;
                  return (
                    <div
                      key={skill.name}
                      className="bg-bg-card/30 border border-border-default/50 rounded-xl p-3 flex items-start gap-3 cursor-default"
                    >
                      <div className="p-2 rounded-lg bg-bg-secondary text-text-secondary">
                        <Icon className="w-4 h-4" />
                      </div>
                      <div>
                        <h4 className="text-xs font-bold text-text-primary">
                          {skill.name}
                        </h4>
                        <p className="text-[10px] text-text-muted mt-0.5 leading-tight">
                          {skill.description}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
