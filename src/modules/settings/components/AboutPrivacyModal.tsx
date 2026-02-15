import {
  Bug,
  ExternalLink,
  Github,
  Globe,
  Lightbulb,
  Mail,
  Shield,
} from "lucide-react";
import React from "react";
import { Modal } from "../../../commons/components/ui";
import { useI18n } from "../../../commons/i18n";

interface AboutPrivacyModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const GITHUB_REPO_URL =
  "https://github.com/DeviantRacoon/ractest-chrome-extension";
const PRIVACY_POLICY_URL = `${GITHUB_REPO_URL}/blob/master/PRIVACY.md`;
const GITHUB_ISSUES_URL = `${GITHUB_REPO_URL}/issues`;
const CONTACT_EMAIL = "jhector.dev@gmail.com";

const buildMailtoLink = (subject: string, body: string) => {
  const params = new URLSearchParams({ subject, body });
  return `mailto:${CONTACT_EMAIL}?${params.toString()}`;
};

export const AboutPrivacyModal: React.FC<AboutPrivacyModalProps> = ({
  isOpen,
  onClose,
}) => {
  const { t } = useI18n();

  const suggestionMailto = buildMailtoLink(
    "RacTest - Suggestion",
    "Hola, te comparto una sugerencia para RacTest:\n\nContexto:\nImpacto:\nPropuesta:\n",
  );

  const bugMailto = buildMailtoLink(
    "RacTest - Bug report",
    "Hola, encontré un problema en RacTest:\n\nPasos para reproducir:\nResultado esperado:\nResultado actual:\n",
  );

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={t("settings.about.title")}>
      <div className="space-y-4">
        <div className="flex flex-col items-center justify-center py-2">
          <img
            src="/logotipo.webp"
            alt="RacTest Logo"
            className="object-contain w-auto h-16 mb-3"
          />
          <p className="text-sm text-text-muted">
            {t("about.version", { version: "1.0.0" })}
          </p>
        </div>

        <div className="space-y-3">
          <div className="p-4 border bg-bg-main/50 rounded-xl border-border-default/50">
            <h3 className="flex items-center gap-2 mb-2 text-sm font-bold text-text-primary">
              <Globe className="w-4 h-4 text-accent-primary" />
              {t("about.section.about")}
            </h3>
            <p className="text-sm leading-relaxed text-text-secondary">
              {t("about.description")}
            </p>
          </div>

          <div className="p-4 border bg-bg-main/50 rounded-xl border-border-default/50">
            <h3 className="flex items-center gap-2 mb-2 text-sm font-bold text-text-primary">
              <Shield className="w-4 h-4 text-accent-primary" />
              {t("about.section.privacy")}
            </h3>
            <ul className="pl-4 space-y-2 text-sm list-disc text-text-muted">
              <li>{t("about.privacy.item1")}</li>
              <li>{t("about.privacy.item2")}</li>
              <li>{t("about.privacy.item3")}</li>
            </ul>
            <a
              href={PRIVACY_POLICY_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 mt-3 text-xs transition-colors text-accent-primary hover:text-accent-primary/80"
            >
              {t("about.privacy.link")}
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>

          <div className="p-4 border bg-bg-main/50 rounded-xl border-border-default/50">
            <h3 className="flex items-center gap-2 mb-2 text-sm font-bold text-text-primary">
              <Mail className="w-4 h-4 text-accent-primary" />
              {t("about.section.feedback")}
            </h3>
            <p className="mb-3 text-sm text-text-muted">
              {t("about.feedback.text")}
            </p>
            <div className="grid grid-cols-1 gap-2">
              <a
                href={suggestionMailto}
                className="inline-flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium transition-colors rounded-lg bg-accent-primary/15 text-accent-primary hover:bg-accent-primary/25"
              >
                <Lightbulb className="w-3.5 h-3.5" />
                {t("about.feedback.suggest")}
              </a>
              <a
                href={bugMailto}
                className="inline-flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium transition-colors border rounded-lg bg-bg-card text-text-secondary hover:text-text-primary border-border-default/70"
              >
                <Bug className="w-3.5 h-3.5" />
                {t("about.feedback.bug")}
              </a>
            </div>
            <p className="mt-2 break-all text-[11px] text-text-muted">
              Email: {CONTACT_EMAIL}
            </p>
          </div>
        </div>

        <div className="flex justify-center gap-4 pt-1">
          <a
            href={GITHUB_REPO_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 text-xs transition-colors text-text-secondary hover:text-accent-primary"
          >
            <Github className="w-4 h-4" />
            GitHub
          </a>
          <a
            href={GITHUB_ISSUES_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 text-xs transition-colors text-text-secondary hover:text-accent-primary"
          >
            <Bug className="w-4 h-4" />
            Issues
          </a>
        </div>

        <p className="text-xs text-center text-text-muted">
          {t("about.community")}
        </p>

        <div className="flex justify-end mt-4">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium transition-colors border rounded-lg bg-bg-secondary text-text-primary hover:bg-bg-card border-border-default"
          >
            {t("about.close")}
          </button>
        </div>
      </div>
    </Modal>
  );
};
