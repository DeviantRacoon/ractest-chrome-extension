/**
 * Security Service for RacTest
 * Handles encryption and decryption of sensitive data using Web Crypto API
 */

const ENCRYPTION_ALGORITHM = "AES-GCM";
const KEY_STORAGE_KEY = "ractest_encryption_key";

class SecurityService {
  private key: CryptoKey | null = null;

  /**
   * Initialize the security service by loading or generating an encryption key
   */
  async initialize(): Promise<void> {
    if (this.key) return;

    // Try to load existing key material from storage
    const stored = await chrome.storage.local.get(KEY_STORAGE_KEY);

    if (stored[KEY_STORAGE_KEY]) {
      // Import existing key
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const keyData = new Uint8Array(stored[KEY_STORAGE_KEY] as any);
      this.key = await window.crypto.subtle.importKey(
        "raw",
        keyData,
        { name: ENCRYPTION_ALGORITHM },
        true,
        ["encrypt", "decrypt"],
      );
    } else {
      // Generate new key
      this.key = await window.crypto.subtle.generateKey(
        {
          name: ENCRYPTION_ALGORITHM,
          length: 256,
        },
        true,
        ["encrypt", "decrypt"],
      );

      // Export and save key
      const exportedKey = await window.crypto.subtle.exportKey("raw", this.key);
      await chrome.storage.local.set({
        [KEY_STORAGE_KEY]: Array.from(new Uint8Array(exportedKey)),
      });
    }
  }

  /**
   * Encrypt text using AES-GCM
   */
  async encrypt(text: string): Promise<string> {
    if (!text) return "";
    await this.initialize();

    if (!this.key) throw new Error("Encryption key not initialized");

    const encoder = new TextEncoder();
    const data = encoder.encode(text);

    // Generate random IV
    const iv = window.crypto.getRandomValues(new Uint8Array(12));

    const encryptedData = await window.crypto.subtle.encrypt(
      {
        name: ENCRYPTION_ALGORITHM,
        iv: iv,
      },
      this.key,
      data,
    );

    // Combine IV and encrypted data into a single string
    // Format: iv_hex:encrypted_hex
    const ivHex = Array.from(iv)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    const encryptedHex = Array.from(new Uint8Array(encryptedData))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    return `${ivHex}:${encryptedHex}`;
  }

  /**
   * Decrypt text
   */
  async decrypt(encryptedText: string): Promise<string> {
    if (!encryptedText) return "";
    // If not in encrypted format (no colon), return generic obscured text or empty to be safe,
    // but likely it's legacy plain text if we support migration.
    // For now assuming all new keys are encrypted.
    if (!encryptedText.includes(":")) {
      // Fallback: assume it's plain text (migration scenario)
      return encryptedText;
    }

    await this.initialize();
    if (!this.key) throw new Error("Encryption key not initialized");

    try {
      const [ivHex, encryptedHex] = encryptedText.split(":");

      const iv = new Uint8Array(
        ivHex.match(/.{1,2}/g)!.map((byte) => parseInt(byte, 16)),
      );
      const encryptedData = new Uint8Array(
        encryptedHex.match(/.{1,2}/g)!.map((byte) => parseInt(byte, 16)),
      );

      const decryptedBuffer = await window.crypto.subtle.decrypt(
        {
          name: ENCRYPTION_ALGORITHM,
          iv: iv,
        },
        this.key,
        encryptedData,
      );

      const decoder = new TextDecoder();
      return decoder.decode(decryptedBuffer);
    } catch (error) {
      console.error("Decryption failed:", error);
      return "";
    }
  }

  /**
   * Check if a string looks like it's encrypted
   */
  isEncrypted(text: string): boolean {
    return (
      typeof text === "string" &&
      text.includes(":") &&
      /^[0-9a-f]+:[0-9a-f]+$/i.test(text)
    );
  }
}

export const securityService = new SecurityService();
