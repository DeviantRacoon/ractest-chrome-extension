import { X } from "lucide-react";
import React, { useEffect, useState } from "react";
import { useI18n } from "../i18n";
import type { FlowFolder } from "../types";
import {
  DEFAULT_FOLDER_ICON,
  FOLDER_ICON_KEYS,
  FOLDER_ICON_MAP,
} from "./folderIcons";
import { Button, Input } from "./ui";

interface FolderModalProps {
  isOpen: boolean;
  folder?: FlowFolder | null; // if provided → edit mode
  onSave: (name: string, icon: string) => Promise<void> | void;
  onClose: () => void;
}

export const FolderModal: React.FC<FolderModalProps> = ({
  isOpen,
  folder,
  onSave,
  onClose,
}) => {
  const { t } = useI18n();
  const [name, setName] = useState("");
  const [icon, setIcon] = useState<string>(DEFAULT_FOLDER_ICON);
  const [saving, setSaving] = useState(false);
  const [nameError, setNameError] = useState<string | undefined>();

  // Sync state when folder changes (edit mode)
  useEffect(() => {
    if (folder) {
      setName(folder.name);
      setIcon(folder.icon || DEFAULT_FOLDER_ICON);
    } else {
      setName("");
      setIcon(DEFAULT_FOLDER_ICON);
    }
    setNameError(undefined);
  }, [folder, isOpen]);

  if (!isOpen) return null;

  const SelectedIcon =
    FOLDER_ICON_MAP[icon] ?? FOLDER_ICON_MAP[DEFAULT_FOLDER_ICON];

  const handleSave = async () => {
    if (!name.trim()) {
      setNameError(t("folders.modal.nameRequired"));
      return;
    }
    setSaving(true);
    try {
      await onSave(name.trim(), icon);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleSave();
    if (e.key === "Escape") onClose();
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div
          className="pointer-events-auto w-full max-w-sm bg-bg-card border border-border-default rounded-2xl shadow-2xl shadow-black/40 overflow-hidden animate-slide-up"
          onKeyDown={handleKeyDown}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-5 pt-5 pb-3">
            <h2 className="text-base font-bold text-text-primary">
              {folder
                ? t("folders.modal.editTitle")
                : t("folders.modal.createTitle")}
            </h2>
            <button
              onClick={onClose}
              className="w-7 h-7 flex items-center justify-center rounded-full text-text-muted hover:text-text-primary hover:bg-bg-hover transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="px-5 pb-5 space-y-4">
            {/* Name */}
            <Input
              label={t("folders.modal.name")}
              placeholder={t("folders.modal.namePlaceholder")}
              value={name}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                setName(e.target.value);
                if (nameError) setNameError(undefined);
              }}
              error={nameError}
              fullWidth
              autoFocus
              className="bg-bg-main/50 border-border-default/60 focus:bg-bg-main"
              leftIcon={
                <SelectedIcon className="w-4 h-4 text-accent-primary" />
              }
            />

            {/* Icon picker — Lucide icons */}
            <div>
              <p className="text-xs font-medium text-text-muted mb-2 uppercase tracking-wider">
                {t("folders.modal.icon")}
              </p>
              <div className="grid grid-cols-10 gap-1">
                {FOLDER_ICON_KEYS.map((key) => {
                  const Icon = FOLDER_ICON_MAP[key];
                  const isSelected = icon === key;
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setIcon(key)}
                      className={`w-8 h-8 flex items-center justify-center rounded-lg transition-all duration-150 ${
                        isSelected
                          ? "bg-accent-primary/20 ring-1 ring-accent-primary text-accent-primary scale-110"
                          : "text-text-muted hover:text-text-primary hover:bg-bg-hover"
                      }`}
                      title={key}
                    >
                      <Icon className="w-4 h-4" />
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-2 pt-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={onClose}
                className="flex-1"
              >
                {t("folders.modal.cancel")}
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={handleSave}
                loading={saving}
                className="flex-1 shadow-lg shadow-accent-primary/20"
              >
                {t("folders.modal.save")}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};
