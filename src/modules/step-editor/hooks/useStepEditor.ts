import {
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { arrayMove, sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useToast } from "../../../commons/components/ui";
import { useI18n } from "../../../commons/i18n";
import { inspectorService } from "../../../commons/lib/inspectorService";
import storageService from "../../../commons/lib/storage";
import type {
  SelectorInfo,
  TestProfile,
  TestStep,
} from "../../../commons/types";
import { agentService } from "../../../core/container";
import { getBestSelector } from "../../inspector/utils/selector";

export const useStepEditor = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();

  const [profile, setProfile] = useState<TestProfile | null>(null);
  const [steps, setSteps] = useState<TestStep[]>([]);
  const [availableRecipes, setAvailableRecipes] = useState<TestProfile[]>([]);
  const [isInspectorActive, setIsInspectorActive] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [hasApiKey, setHasApiKey] = useState<boolean | null>(null);
  const { t } = useI18n();

  // Check for API Key on mount
  useEffect(() => {
    const checkApiKey = async () => {
      const settings = await storageService.getSettings();
      setHasApiKey(!!settings.openRouterApiKey);
    };
    checkApiKey();
  }, []);

  // Drag and drop sensors
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const [isRecording, setIsRecording] = useState(false);
  const { success, error } = useToast();

  // Load profile and steps
  useEffect(() => {
    loadProfile();
  }, [id]);

  // Listen for captured elements from inspector
  useEffect(() => {
    // We need to manage the listener carefully to avoid duplicates or stale closures
    const handleCapture = (selectorInfo: SelectorInfo) => {
      handleElementCaptured(selectorInfo);
    };

    inspectorService.onElementCaptured(handleCapture);
  }, [steps, isRecording]); // dependency on steps and isRecording needed

  const loadProfile = async () => {
    if (!id) {
      setLoading(false);
      return;
    }

    try {
      const allProfiles = await storageService.getProfiles();
      const loadedProfile = allProfiles.find((p) => p.id === id);
      if (loadedProfile) {
        setProfile(loadedProfile);
        setSteps(loadedProfile.steps || []);
      }
      setAvailableRecipes(allProfiles.filter((p) => p.id !== id));
    } catch (err) {
      console.error("Error loading profile:", err);
      error(t("stepEditor.toast.loadError"));
    } finally {
      setLoading(false);
    }
  };

  const handleElementCaptured = (selectorInfo: SelectorInfo) => {
    const bestSelector = getBestSelector(selectorInfo);

    // Smart Action Detection
    let action: "CLICK" | "TYPE" | "SELECT" = "CLICK";
    const tagName = selectorInfo.tagName.toLowerCase();

    if (tagName === "input" || tagName === "textarea") {
      // Check input type to avoid setting TYPE on checkbox/radio
      // (This detail might need more info from selectorInfo if available,
      // but for now generic input is a good guess for TYPE)
      action = "TYPE";
    } else if (tagName === "select") {
      action = "SELECT";
    }

    const newStep: TestStep = {
      id: crypto.randomUUID(),
      action: action,
      selector: bestSelector,
      delay: 500,
      order: steps.length + 1,
      value: "", // Initialize value
    };

    setSteps((prev) => [...prev, newStep]);

    if (isRecording) {
      // In recording mode, we don't deactivate
      success(t("stepEditor.toast.captureStep", { action, tag: tagName }));
    } else {
      // Single capture mode
      handleDeactivateInspector();
    }
  };

  const toggleRecording = async () => {
    if (isRecording) {
      // Stop recording
      await handleDeactivateInspector();
      setIsRecording(false);
    } else {
      // Start recording
      await handleActivateInspector();
      setIsRecording(true);
    }
  };

  const handleActivateInspector = async () => {
    try {
      await inspectorService.activateInspector(id || "temp-profile");
      setIsInspectorActive(true);
    } catch (err) {
      console.error("Failed to activate inspector:", err);
      error(t("stepEditor.toast.activateInspectorError"));
      setIsRecording(false); // Reset recording state on failure
    }
  };

  const handleDeactivateInspector = async () => {
    try {
      await inspectorService.deactivateInspector();
      setIsInspectorActive(false);
      setIsRecording(false); // Ensure recording is off when deactivating
    } catch (err) {
      console.error("Failed to deactivate inspector:", err);
    }
  };

  const handleCaptureSingle = async () => {
    setIsRecording(false);
    if (isInspectorActive) {
      await handleDeactivateInspector();
      return;
    }
    await handleActivateInspector();
  };

  const handleOpenUrlAndActivate = async () => {
    if (!profile?.url) {
      error(t("stepEditor.toast.noUrl"));
      return;
    }

    try {
      // Check if running as Chrome extension
      if (typeof chrome === "undefined" || !chrome.tabs) {
        error(t("stepEditor.toast.extensionOnly"));
        return;
      }

      // Open URL in new tab
      const tab = await chrome.tabs.create({ url: profile.url, active: true });

      // Activate inspector in the new tab (service will wait for content script)
      if (tab.id) {
        // Wait a bit for tab to load? The service might handle retries.
        // We'll just try to activate.
        await inspectorService.activateInspector(id || "temp-profile");
        setIsInspectorActive(true);
        if (isRecording) {
          // Check if we should be recording?
          // Usually handleOpenUrlAndActivate implies starting a session.
          // Let's assume user might want to inspect single element or record.
          // For now, keep behavior simple: just active state.
        }
        success(t("stepEditor.toast.openInspectorOk"));
      }
    } catch (err) {
      console.error("Failed to open URL and activate inspector:", err);
      error(t("stepEditor.toast.openUrlError"));
    }
  };

  const handleStepUpdate = (stepId: string, updates: Partial<TestStep>) => {
    setSteps((prev) =>
      prev.map((step) => (step.id === stepId ? { ...step, ...updates } : step)),
    );
  };

  const handleStepDelete = (stepId: string) => {
    setSteps((prev) => {
      const filtered = prev.filter((step) => step.id !== stepId);
      // Reorder remaining steps
      return filtered.map((step, index) => ({
        ...step,
        order: index + 1,
      }));
    });
  };

  const handleStepHighlight = async (selector: string) => {
    try {
      await inspectorService.highlightElement(selector);
    } catch (err) {
      console.error("Failed to highlight element:", err);
      error(t("stepEditor.toast.highlightError"));
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      setSteps((items) => {
        const oldIndex = items.findIndex((item) => item.id === active.id);
        const newIndex = items.findIndex((item) => item.id === over.id);

        const reordered = arrayMove(items, oldIndex, newIndex);

        // Update order property
        return reordered.map((step, index) => ({
          ...step,
          order: index + 1,
        }));
      });
    }
  };

  const validateSteps = (): boolean => {
    for (const step of steps) {
      if (step.action === "DIVIDER") continue;

      // TYPE and SELECT require a value
      // Exception: TYPE with useFakeData does not require a value
      if (step.action === "TYPE") {
        if (!step.value?.trim() && !step.useFakeData) {
          error(t("stepEditor.toast.typeNeedsValue", { order: step.order }));
          return false;
        }
      } else if (step.action === "SELECT" && !step.value?.trim()) {
        error(t("stepEditor.toast.selectNeedsValue", { order: step.order }));
        return false;
      }

      // All steps need a selector
      if (!step.selector) {
        error(t("stepEditor.toast.selectorMissing", { order: step.order }));
        return false;
      }
    }

    return true;
  };

  const handleSave = async () => {
    if (!profile) return;

    // Validate first
    if (!validateSteps()) {
      return;
    }

    setSaving(true);
    try {
      const updatedProfile: TestProfile = {
        ...profile,
        steps,
        updatedAt: Date.now(),
      };
      await storageService.updateProfile(updatedProfile);
      success(t("stepEditor.toast.saved"));
      navigate("/");
    } catch (err) {
      console.error("Error saving profile:", err);
      error(t("stepEditor.toast.saveError"));
    } finally {
      setSaving(false);
    }
  };

  const handleAddDivider = () => {
    const newStep: TestStep = {
      id: crypto.randomUUID(),
      action: "DIVIDER",
      selector: "body", // Dummy selector
      value: "",
      delay: 0,
      order: steps.length + 1,
    };
    setSteps((prev) => [...prev, newStep]);
  };

  const handleAddRecipe = () => {
    const newStep: TestStep = {
      id: crypto.randomUUID(),
      action: "RECIPE",
      selector: "body", // Dummy selector
      value: "",
      delay: 0,
      order: steps.length + 1,
    };
    setSteps((prev) => [...prev, newStep]);
  };

  const [aiModalOpen, setAiModalOpen] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);

  const handleAIGenerate = async (
    prompt: string,
    mode: "fast" | "normal" | "complex" = "normal",
  ) => {
    setAiLoading(true);
    try {
      // Dynamic import to avoid circular dependencies if any
      const { aiStepGenerator } =
        await import("../../ai-assistant/services/aiStepGenerator");

      const result = await aiStepGenerator.generateStepsParams(
        prompt,
        undefined,
        mode,
      );

      if (result.steps.length > 0) {
        // Append new steps
        const newSteps = result.steps.map((s) => ({
          ...s,
          order: steps.length + s.order, // Adjust order
        }));

        setSteps((prev) => [...prev, ...newSteps]);
        success(t("stepEditor.toast.aiGenerated", { count: newSteps.length }));
        setAiModalOpen(false);
      } else {
        error(t("stepEditor.toast.aiNoSteps"));
      }
    } catch (err: any) {
      console.error("AI Generation Error:", err);
      // Show the exact error message from the service
      error(err.message || t("stepEditor.toast.aiConnectError"));
    } finally {
      setAiLoading(false);
    }
  };

  const handleOpenAIModal = async () => {
    // Failsafe
    const settings = await storageService.getSettings();
    if (!settings.openRouterApiKey) {
      error(t("stepEditor.toast.noApiKey"));
      setHasApiKey(false);
      return;
    }
    setAiModalOpen(true);
  };
  const handleCloseAIModal = () => setAiModalOpen(false);

  const [isAgentMode, setIsAgentMode] = useState(false);
  const [isAgentRunning, setIsAgentRunning] = useState(false);
  const [agentLogs, setAgentLogs] = useState<any[]>([]);

  useEffect(() => {
    // Subscribe to agent logs
    agentService.setLogCallback((log) => {
      setAgentLogs((prev) => [...prev, log]);
    });
  }, []);

  const toggleAgentMode = () => {
    setIsAgentMode(!isAgentMode);
    // When switching modes, ensure other states are reset
    if (!isAgentMode) {
      // Entering Agent Mode
      setIsInspectorActive(false);
    }
  };

  const handleAgentStart = async (goal: string) => {
    if (!profile || !goal.trim()) return;
    setIsAgentRunning(true);
    setAgentLogs([]); // Clear previous logs
    try {
      await agentService.start(goal, profile.id);
    } catch (e) {
      console.error(e);
      setAgentLogs((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          timestamp: Date.now(),
          type: "error",
          message:
            "Error starting agent: " +
            (e instanceof Error ? e.message : String(e)),
        },
      ]);
    } finally {
      setIsAgentRunning(false);
    }
  };

  const handleAgentStop = async () => {
    agentService.stop();
  };

  const clearAgentLogs = () => {
    setAgentLogs([]);
  };

  return {
    id,
    profile,
    steps,
    isInspectorActive,
    isRecording,
    loading,
    saving,
    sensors,
    closestCenter, // Exporting this constant for convenience
    handleActivateInspector,
    handleDeactivateInspector,
    toggleRecording,
    handleOpenUrlAndActivate,
    handleStepUpdate,
    handleStepDelete,
    handleStepHighlight,
    handleDragEnd,
    handleSave,
    handleAddDivider,
    handleAddRecipe,
    navigate,
    setSteps, // Export if needed for advanced cases, but handlers should cover it
    aiModalOpen,
    aiLoading,
    handleOpenAIModal,
    handleCloseAIModal,
    handleAIGenerate,
    handleCaptureSingle,
    // Agent Mode
    isAgentMode,
    isAgentRunning,
    toggleAgentMode,
    agentLogs,
    handleAgentStart,
    handleAgentStop,
    clearAgentLogs,
    hasApiKey,
    availableRecipes,
  };
};
