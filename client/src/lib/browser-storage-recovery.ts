const STORAGE_VERSION_KEY = "protocol-app-storage-version";
const STORAGE_VERSION = "2026-06-04-browser-recovery";
const MAX_LOCAL_PROTOCOL_BYTES = 1_500_000;

const dangerousProtocolCacheKey = (key: string) =>
  key.startsWith("protocol-") &&
  (
    key.endsWith("-generated") ||
    key.includes("-generated-") ||
    key.includes("generatedProtocol")
  );

const stripLargeProtocolCacheFields = (value: string) => {
  try {
    const parsed = JSON.parse(value);
    if (!parsed || typeof parsed !== "object") return null;

    if ("generatedProtocol" in parsed) {
      parsed.generatedProtocol = "[]";
      parsed.generatedProtocolStoredInDatabase = true;
    }

    if (Array.isArray(parsed.components)) {
      parsed.components = parsed.components.map((component: any) => {
        if (!component || typeof component !== "object") return component;
        const copy = { ...component };
        if (copy.type === "generatedProtocol") return null;
        return copy;
      }).filter(Boolean);
    }

    return JSON.stringify(parsed);
  } catch {
    return null;
  }
};

export function cleanupLegacyProtocolStorage() {
  if (typeof window === "undefined") return;

  try {
    const keys = Array.from({ length: localStorage.length }, (_, index) => localStorage.key(index))
      .filter((key): key is string => Boolean(key));

    for (const key of keys) {
      if (dangerousProtocolCacheKey(key)) {
        localStorage.removeItem(key);
        continue;
      }

      if (!key.startsWith("protocol_")) continue;

      const value = localStorage.getItem(key);
      if (!value) continue;

      if (value.length > MAX_LOCAL_PROTOCOL_BYTES) {
        const stripped = stripLargeProtocolCacheFields(value);
        if (stripped && stripped.length < MAX_LOCAL_PROTOCOL_BYTES) {
          localStorage.setItem(key, stripped);
        } else {
          localStorage.removeItem(key);
        }
      }
    }
  } catch (error) {
    console.warn("Protocol app storage cleanup skipped:", error);
  }
}

export function runBrowserStorageRecovery() {
  if (typeof window === "undefined") return;

  cleanupLegacyProtocolStorage();

  try {
    const version = localStorage.getItem(STORAGE_VERSION_KEY);
    if (version !== STORAGE_VERSION) {
      cleanupLegacyProtocolStorage();
      localStorage.setItem(STORAGE_VERSION_KEY, STORAGE_VERSION);
    }
  } catch (error) {
    console.warn("Protocol app storage migration marker skipped:", error);
  }
}

export function clearLocalDraftCache() {
  if (typeof window === "undefined") return;

  try {
    const keys = Array.from({ length: localStorage.length }, (_, index) => localStorage.key(index))
      .filter((key): key is string => Boolean(key));

    for (const key of keys) {
      if (
        key.startsWith("protocol_") ||
        key.startsWith("protocol-") ||
        key.startsWith("section-review-") ||
        key.includes("sectionInputReview") ||
        key.includes("alignment") ||
        key.includes("recommendation")
      ) {
        localStorage.removeItem(key);
      }
    }
  } catch (error) {
    console.warn("Could not clear local draft cache:", error);
  }
}

export function safeSetLocalStorageItem(key: string, value: string) {
  if (typeof window === "undefined") return;

  try {
    localStorage.setItem(key, value);
  } catch (error) {
    console.warn(`Skipping local cache write for ${key}:`, error);

    cleanupLegacyProtocolStorage();

    try {
      localStorage.setItem(key, value);
    } catch (retryError) {
      console.warn(`Skipping local cache write for ${key} after cleanup:`, retryError);
    }
  }
}
