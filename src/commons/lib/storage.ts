// Storage Layer for RacTest Chrome Extension
import type {
  FlowFolder,
  RecipeExecutionResult,
  TestProfile,
  UserSettings,
} from "../types";
import { StorageKeys } from "../types";

import { securityService as securityServiceInstance } from "./securityService";

// Check if we're in a Chrome extension context
const isExtension = typeof chrome !== "undefined" && chrome.storage;

/**
 * Mock storage for development (when not running as extension)
 */
class MockStorage {
  private storage: Record<string, unknown> = {};

  async get(key: string): Promise<Record<string, unknown>> {
    return { [key]: this.storage[key] };
  }

  async set(data: Record<string, unknown>): Promise<void> {
    Object.assign(this.storage, data);
  }

  async clear(): Promise<void> {
    this.storage = {};
  }
}

const mockStorage = new MockStorage();

/**
 * Storage service for managing recipes, settings, and history
 * Uses chrome.storage.local for persistence (or mock in development)
 */
class StorageService {
  private get storage() {
    return isExtension ? chrome.storage.local : mockStorage;
  }

  private securityService = securityServiceInstance;

  /**
   * Get all test profiles
   */
  async getProfiles(): Promise<TestProfile[]> {
    try {
      const result = await this.storage.get(StorageKeys.PROFILES);
      return (result[StorageKeys.PROFILES] as TestProfile[]) || [];
    } catch (error) {
      console.error("Error getting profiles:", error);
      return [];
    }
  }

  /**
   * Get a single profile by ID
   */
  async getProfile(id: string): Promise<TestProfile | null> {
    const profiles = await this.getProfiles();
    return profiles.find((p) => p.id === id) || null;
  }

  /**
   * Save a new profile
   */
  async saveProfile(
    profile: Omit<TestProfile, "id" | "createdAt" | "updatedAt">,
  ): Promise<TestProfile> {
    const profiles = await this.getProfiles();

    const newProfile: TestProfile = {
      ...profile,
      id: crypto.randomUUID(),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    profiles.push(newProfile);
    await this.storage.set({ [StorageKeys.PROFILES]: profiles });

    return newProfile;
  }

  /**
   * Update an existing profile
   * Supports both (id, updates) and (fullProfile) signatures
   */
  async updateProfile(
    idOrProfile: string | TestProfile,
    updates?: Partial<Omit<TestProfile, "id" | "createdAt">>,
  ): Promise<TestProfile | null> {
    const profiles = await this.getProfiles();

    let profileId: string;
    let updatedData: Partial<TestProfile>;

    // Handle both signatures for backwards compatibility
    if (typeof idOrProfile === "string") {
      // Called with (id, updates)
      profileId = idOrProfile;
      updatedData = updates || {};
    } else {
      // Called with (fullProfile)
      profileId = idOrProfile.id;
      updatedData = idOrProfile;
    }

    const index = profiles.findIndex((p) => p.id === profileId);

    if (index === -1) {
      return null;
    }

    profiles[index] = {
      ...profiles[index],
      ...updatedData,
      updatedAt: Date.now(),
    };

    await this.storage.set({ [StorageKeys.PROFILES]: profiles });

    return profiles[index];
  }

  /**
   * Upsert imported profiles preserving IDs.
   * Existing IDs are updated, new IDs are created.
   */
  async importProfiles(
    importedProfiles: TestProfile[],
  ): Promise<{ imported: number; updated: number; created: number }> {
    const existingProfiles = await this.getProfiles();
    const byId = new Map(existingProfiles.map((p) => [p.id, p]));

    let updated = 0;
    let created = 0;

    for (const profile of importedProfiles) {
      if (!profile?.id || !profile?.name || !Array.isArray(profile?.steps)) {
        continue;
      }

      const normalized: TestProfile = {
        ...profile,
        createdAt: profile.createdAt || Date.now(),
        updatedAt: profile.updatedAt || Date.now(),
      };

      if (byId.has(normalized.id)) {
        updated++;
      } else {
        created++;
      }
      byId.set(normalized.id, normalized);
    }

    const mergedProfiles = Array.from(byId.values());
    await this.storage.set({ [StorageKeys.PROFILES]: mergedProfiles });

    return {
      imported: updated + created,
      updated,
      created,
    };
  }

  /**
   * Delete a profile
   */
  async deleteProfile(id: string): Promise<boolean> {
    const profiles = await this.getProfiles();
    const filteredProfiles = profiles.filter((p) => p.id !== id);

    if (filteredProfiles.length === profiles.length) {
      return false; // Profile not found
    }

    await this.storage.set({ [StorageKeys.PROFILES]: filteredProfiles });
    return true;
  }

  // ─── Folder CRUD ─────────────────────────────────────────────────────────────

  /**
   * Get all folders
   */
  async getFolders(): Promise<FlowFolder[]> {
    try {
      const result = await this.storage.get(StorageKeys.FOLDERS);
      return (result[StorageKeys.FOLDERS] as FlowFolder[]) || [];
    } catch (error) {
      console.error("Error getting folders:", error);
      return [];
    }
  }

  /**
   * Create a new folder
   */
  async saveFolder(
    folder: Omit<FlowFolder, "id" | "createdAt" | "updatedAt">,
  ): Promise<FlowFolder> {
    const folders = await this.getFolders();
    const newFolder: FlowFolder = {
      ...folder,
      id: crypto.randomUUID(),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    folders.push(newFolder);
    await this.storage.set({ [StorageKeys.FOLDERS]: folders });
    return newFolder;
  }

  /**
   * Update an existing folder
   */
  async updateFolder(
    id: string,
    updates: Partial<Omit<FlowFolder, "id" | "createdAt">>,
  ): Promise<FlowFolder | null> {
    const folders = await this.getFolders();
    const index = folders.findIndex((f) => f.id === id);
    if (index === -1) return null;
    folders[index] = { ...folders[index], ...updates, updatedAt: Date.now() };
    await this.storage.set({ [StorageKeys.FOLDERS]: folders });
    return folders[index];
  }

  /**
   * Delete a folder — flows inside are ungrouped (folderId cleared)
   */
  async deleteFolder(id: string): Promise<boolean> {
    const folders = await this.getFolders();
    const filtered = folders.filter((f) => f.id !== id);
    if (filtered.length === folders.length) return false;

    // Ungroup any profiles that belonged to this folder
    const profiles = await this.getProfiles();
    const updated = profiles.map((p) =>
      p.folderId === id ? { ...p, folderId: undefined } : p,
    );

    await this.storage.set({
      [StorageKeys.FOLDERS]: filtered,
      [StorageKeys.PROFILES]: updated,
    });
    return true;
  }

  /**
   * Get user settings
   */
  async getSettings(): Promise<UserSettings> {
    try {
      const result = await this.storage.get(StorageKeys.SETTINGS);
      const storedSettings =
        (result[StorageKeys.SETTINGS] as Partial<UserSettings>) || {};
      const settings = {
        ...this.getDefaultSettings(),
        ...storedSettings,
      };

      // Decrypt API Key if present and encrypted
      if (
        settings.openRouterApiKey &&
        this.securityService.isEncrypted(settings.openRouterApiKey)
      ) {
        settings.openRouterApiKey = await this.securityService.decrypt(
          settings.openRouterApiKey,
        );
      }

      return settings;
    } catch (error) {
      console.error("Error getting settings:", error);
      return this.getDefaultSettings();
    }
  }

  /**
   * Update user settings
   */
  async updateSettings(settings: Partial<UserSettings>): Promise<UserSettings> {
    const currentSettings = await this.getSettings();
    const newSettings = { ...currentSettings, ...settings };

    // Encrypt API Key if present and not already encrypted
    if (
      newSettings.openRouterApiKey &&
      !this.securityService.isEncrypted(newSettings.openRouterApiKey)
    ) {
      newSettings.openRouterApiKey = await this.securityService.encrypt(
        newSettings.openRouterApiKey,
      );
    }

    await this.storage.set({ [StorageKeys.SETTINGS]: newSettings });

    return newSettings;
  }

  /**
   * Get execution history
   */
  async getHistory(): Promise<RecipeExecutionResult[]> {
    try {
      const result = await this.storage.get(StorageKeys.HISTORY);
      return (result[StorageKeys.HISTORY] as RecipeExecutionResult[]) || [];
    } catch (error) {
      console.error("Error getting history:", error);
      return [];
    }
  }

  /**
   * Add execution result to history
   */
  async addToHistory(executionResult: RecipeExecutionResult): Promise<void> {
    const history = await this.getHistory();
    history.unshift(executionResult); // Add to beginning

    // Keep only last 50 executions
    const trimmedHistory = history.slice(0, 50);

    await this.storage.set({ [StorageKeys.HISTORY]: trimmedHistory });
  }

  /**
   * Replace history from imported data.
   */
  async replaceHistory(history: RecipeExecutionResult[]): Promise<void> {
    const safeHistory = Array.isArray(history) ? history.slice(0, 50) : [];
    await this.storage.set({ [StorageKeys.HISTORY]: safeHistory });
  }

  /**
   * Clear all history
   */
  async clearHistory(): Promise<void> {
    await this.storage.set({ [StorageKeys.HISTORY]: [] });
  }

  /**
   * Clear all data (profiles, history, settings)
   */
  async clearAllData(): Promise<void> {
    if (isExtension) {
      await chrome.storage.local.clear();
    } else {
      await mockStorage.clear();
    }
  }

  /**
   * Default settings
   */
  private getDefaultSettings(): UserSettings {
    return {
      defaultDelay: 500,
      theme: "dark",
      language: "en",
      highlightColor: "#10B981",
      notificationsEnabled: true,
      enableAiForTesting: true,
      agentMaxSteps: 20,
      agentMode: "strict_fail_fast",
      maxRetriesNonCritical: 0,
    };
  }

  /**
   * Initialize storage with mock data (for development)
   */
  async initializeMockData(): Promise<void> {
    const profiles = await this.getProfiles();

    if (profiles.length === 0) {
      const mockProfiles: TestProfile[] = [
        {
          id: crypto.randomUUID(),
          name: "Login Flow Test",
          url: "https://example.com/login",
          steps: [
            {
              id: "1",
              action: "TYPE",
              selector: "#username",
              value: "testuser",
              delay: 500,
              order: 0,
            },
            {
              id: "2",
              action: "TYPE",
              selector: "#password",
              value: "password123",
              delay: 500,
              order: 1,
            },
            {
              id: "3",
              action: "CLICK",
              selector: "#login-btn",
              delay: 1000,
              order: 2,
            },
          ],
          createdAt: Date.now() - 86400000,
          updatedAt: Date.now() - 86400000,
        },
        {
          id: crypto.randomUUID(),
          name: "Registration Form",
          url: "https://example.com/register",
          steps: [
            {
              id: "1",
              action: "TYPE",
              selector: "#email",
              value: "test@example.com",
              delay: 500,
              order: 0,
            },
            {
              id: "2",
              action: "TYPE",
              selector: "#name",
              value: "Test User",
              delay: 500,
              order: 1,
            },
            {
              id: "3",
              action: "CHECK",
              selector: "#terms",
              delay: 300,
              order: 2,
            },
            {
              id: "4",
              action: "CLICK",
              selector: "#submit",
              delay: 1000,
              order: 3,
            },
          ],
          createdAt: Date.now() - 172800000,
          updatedAt: Date.now() - 172800000,
        },
      ];

      await this.storage.set({ [StorageKeys.PROFILES]: mockProfiles });
    }
  }
}

// Export singleton instance
export const storageService = new StorageService();
export default storageService;
