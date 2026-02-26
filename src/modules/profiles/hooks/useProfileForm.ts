import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useI18n } from "../../../commons/i18n";
import storageService from "../../../commons/lib/storage";
import type { FlowFolder } from "../../../commons/types";

export const useProfileForm = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const profileId = searchParams.get("id");

  const [loading, setLoading] = useState(false);
  const { t } = useI18n();
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [folderId, setFolderId] = useState<string>("");
  const [enableFinalValidation, setEnableFinalValidation] = useState(true);
  const [folders, setFolders] = useState<FlowFolder[]>([]);
  const [errors, setErrors] = useState<{ name?: string; url?: string }>({});
  const [isUrlHighlighted, setIsUrlHighlighted] = useState(false);

  // Load folders for the dropdown
  useEffect(() => {
    storageService
      .getFolders()
      .then(setFolders)
      .catch((e) => console.error("Error loading folders:", e));
  }, []);

  // Load profile if editing
  useEffect(() => {
    if (profileId) {
      loadProfile(profileId);
    }
  }, [profileId]);

  // Prefill URL with active tab when creating a new profile
  useEffect(() => {
    if (profileId || url) return;
    if (typeof chrome === "undefined" || !chrome.tabs?.query) return;

    const prefillFromActiveTab = async () => {
      try {
        const [tab] = await chrome.tabs.query({
          active: true,
          currentWindow: true,
        });
        const tabUrl = tab?.url || "";
        if (/^https?:\/\//i.test(tabUrl)) {
          setUrl(tabUrl);
        }
      } catch (error) {
        console.error("Error prefilling current URL:", error);
      }
    };

    prefillFromActiveTab();
  }, [profileId, url]);

  const loadProfile = async (id: string) => {
    setLoading(true);
    try {
      const profiles = await storageService.getProfiles();
      const profile = profiles.find((p) => p.id === id);
      if (profile) {
        setName(profile.name);
        setUrl(profile.url);
        setFolderId(profile.folderId ?? "");
        setEnableFinalValidation(profile.enableFinalValidation !== false);
      }
    } catch (error) {
      console.error("Error loading profile:", error);
    } finally {
      setLoading(false);
    }
  };

  const validateForm = (): boolean => {
    const newErrors: { name?: string; url?: string } = {};

    if (!name.trim()) {
      newErrors.name = t("profile.error.nameRequired");
    }

    if (!url.trim()) {
      newErrors.url = t("profile.error.urlRequired");
    } else {
      try {
        new URL(url);
      } catch {
        newErrors.url = t("profile.error.urlInvalid");
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
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
          setIsUrlHighlighted(true);
          setTimeout(() => setIsUrlHighlighted(false), 1000);
        }
      } catch (error) {
        console.error("Error getting current URL:", error);
      }
    }
  };

  const handleSave = async () => {
    if (!validateForm()) return;

    setLoading(true);
    try {
      const folderIdValue = folderId || undefined;
      if (profileId) {
        // Update existing
        await storageService.updateProfile(profileId, {
          name: name.trim(),
          url: url.trim(),
          folderId: folderIdValue,
          enableFinalValidation,
        });
        navigate("/");
      } else {
        // Create new and navigate to step editor
        const newProfile = await storageService.saveProfile({
          name: name.trim(),
          url: url.trim(),
          folderId: folderIdValue,
          enableFinalValidation,
          steps: [],
        });
        navigate(`/profile/${newProfile.id}/steps`);
      }
    } catch (error) {
      console.error("Error saving profile:", error);
    } finally {
      setLoading(false);
    }
  };

  return {
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
    navigate, // Export navigate for the Back button
  };
};
