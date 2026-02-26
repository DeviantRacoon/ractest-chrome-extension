import { ArrowLeft, FolderOpen, Globe, Layout, Link, Type } from "lucide-react";
import React from "react";
import { FOLDER_ICON_MAP } from "../../commons/components/folderIcons";
import { Button, Input, Select } from "../../commons/components/ui";
import { useI18n } from "../../commons/i18n";
import type { useProfileForm } from "./hooks/useProfileForm";

type ProfileFormViewProps = ReturnType<typeof useProfileForm>;

export const ProfileFormView: React.FC<ProfileFormViewProps> = ({
  profileId,
  loading,
  name,
  setName,
  url,
  setUrl,
  folderId,
  setFolderId,
  enableFinalValidation,
  setEnableFinalValidation,
  folders,
  errors,
  isUrlHighlighted,
  handleGetCurrentUrl,
  handleSave,
  navigate,
}) => {
  const { t } = useI18n();

  return (
    <div className="flex flex-col h-full bg-bg-main relative">
      {/* Header */}
      <div className="sticky top-0 z-20 bg-bg-main/95 backdrop-blur supports-[backdrop-filter]:bg-bg-main/60 border-b border-border-default px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate("/")}
            className="w-8 h-8 p-0 rounded-full hover:bg-bg-card -ml-2"
          >
            <ArrowLeft className="w-5 h-5 text-text-secondary" />
          </Button>
          <h1 className="text-lg font-bold text-text-primary">
            {profileId ? t("profile.edit") : t("profile.new")}
          </h1>
        </div>
        <Button
          variant="primary"
          size="sm"
          onClick={handleSave}
          loading={loading}
          className="shadow-lg shadow-accent-primary/20"
        >
          {profileId ? t("profile.save") : t("profile.create")}
        </Button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 pt-6">
        {loading && !name ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-2 border-accent-primary border-t-transparent"></div>
          </div>
        ) : (
          <div className="space-y-6 max-w-lg mx-auto animate-slide-up">
            {/* General Info Section */}
            <div className="space-y-4">
              <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wider px-1">
                {t("profile.generalInfo")}
              </h3>
              <div className="space-y-4">
                <Input
                  label={t("profile.name")}
                  placeholder={t("profile.namePlaceholder")}
                  value={name}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    setName(e.target.value)
                  }
                  error={errors.name}
                  fullWidth
                  leftIcon={<Type className="w-4 h-4" />}
                  className="bg-bg-card/50 border-border-default/50 focus:bg-bg-card"
                />
                <Input
                  label={t("profile.url")}
                  type="url"
                  placeholder={t("profile.urlPlaceholder")}
                  value={url}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    setUrl(e.target.value)
                  }
                  error={errors.url}
                  helperText={t("profile.urlHelper")}
                  fullWidth
                  leftIcon={<Globe className="w-4 h-4" />}
                  rightIcon={
                    <button
                      type="button"
                      onClick={handleGetCurrentUrl}
                      className={`p-1.5 rounded-md transition-all duration-300 ${
                        isUrlHighlighted
                          ? "bg-accent-primary/20 text-accent-primary scale-110"
                          : "hover:bg-bg-hover text-text-muted hover:text-accent-primary"
                      }`}
                      title={t("profile.useCurrentUrl")}
                    >
                      <Link className="w-4 h-4" />
                    </button>
                  }
                  className={`bg-bg-card/50 border-border-default/50 focus:bg-bg-card transition-all duration-500 ${
                    isUrlHighlighted
                      ? "ring-2 ring-accent-primary/50 border-accent-primary shadow-[0_0_15px_rgba(16,185,129,0.2)]"
                      : ""
                  }`}
                />

                {/* Folder picker */}
                <div className="space-y-1.5">
                  <Select
                    label={t("folders.noFolder")}
                    leftIcon={<FolderOpen className="w-4 h-4" />}
                    value={folderId}
                    onChange={setFolderId}
                    options={[
                      { value: "", label: t("folders.noFolder") },
                      ...folders.map((f) => {
                        const IconComponent =
                          FOLDER_ICON_MAP[f.icon ?? "folder"];
                        return {
                          value: f.id,
                          label: f.name,
                          icon: IconComponent ? (
                            <IconComponent className="w-4 h-4" />
                          ) : undefined,
                        };
                      }),
                    ]}
                    className="bg-bg-card/50 border-border-default/50"
                    fullWidth
                  />
                </div>

                <div className="rounded-xl border border-border-default bg-bg-card/30 p-3">
                  <div
                    className="flex items-center gap-2 cursor-pointer group/toggle"
                    onClick={() =>
                      setEnableFinalValidation(!enableFinalValidation)
                    }
                  >
                    <div
                      className={`w-9 h-5 rounded-full relative transition-colors duration-200 ease-in-out flex-shrink-0 ${
                        enableFinalValidation
                          ? "bg-accent-primary"
                          : "bg-bg-secondary border border-border-default hover:border-text-muted"
                      }`}
                    >
                      <div
                        className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-transform duration-200 ease-in-out ${
                          enableFinalValidation
                            ? "translate-x-4.5 left-0.5"
                            : "left-0.5"
                        }`}
                      />
                    </div>
                    <div className="flex flex-col gap-0.5">
                      <span className="text-sm text-text-primary select-none">
                        {t("profile.finalValidation.label")}
                      </span>
                      <span className="text-xs text-text-muted select-none">
                        {t("profile.finalValidation.helper")}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Configuration Section (Only for Edit) */}
            {profileId && (
              <div className="space-y-3 pt-2">
                <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wider px-1">
                  {t("profile.configuration")}
                </h3>
                <div
                  onClick={() => navigate(`/profile/${profileId}/steps`)}
                  className="group flex items-center justify-between p-4 rounded-xl border border-border-default bg-bg-card/30 hover:bg-bg-card hover:border-accent-primary/30 cursor-pointer transition-all duration-200"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-accent-primary/10 flex items-center justify-center text-accent-primary group-hover:scale-110 transition-transform">
                      <Layout className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="text-base font-medium text-text-primary group-hover:text-accent-primary transition-colors">
                        {t("profile.steps.title")}
                      </h4>
                      <p className="text-xs text-text-muted">
                        {t("profile.steps.desc")}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 text-text-muted group-hover:text-text-primary transition-colors">
                    <span className="text-xs font-medium">
                      {t("profile.steps.configure")}
                    </span>
                    <svg
                      className="w-4 h-4"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M9 5l7 7-7 7"
                      />
                    </svg>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
