const LARGE_TEXT_LIMIT = 12000;
const PREVIEW_IMAGE_LIMIT = 5_800_000;

type StripOptions = {
  preservePreviewImages?: boolean;
};

const maybeParseJson = (value: unknown) => {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  if (!trimmed || (!trimmed.startsWith("{") && !trimmed.startsWith("["))) return value;
  try {
    return JSON.parse(trimmed);
  } catch {
    return value;
  }
};

export function stripLargeSourceArtifacts(
  value: any,
  seen = new WeakSet<object>(),
  options: StripOptions = {}
): any {
  if (value == null) return value;

  if (typeof value === "string") {
    const parsed = maybeParseJson(value);
    if (parsed !== value) {
      try {
        return JSON.stringify(stripLargeSourceArtifacts(parsed, seen, options));
      } catch {
        return value.length > LARGE_TEXT_LIMIT
          ? `${value.slice(0, LARGE_TEXT_LIMIT)}\n[large text truncated for browser review payload]`
          : value;
      }
    }

    if (value.length > LARGE_TEXT_LIMIT && /<\/?w:|<w:tbl|base64,/i.test(value)) {
      return `[large source artifact omitted: ${value.length} characters]`;
    }
    return value;
  }

  if (typeof value !== "object") return value;
  if (seen.has(value)) return undefined;
  seen.add(value);

  if (Array.isArray(value)) {
    return value.map((item) => stripLargeSourceArtifacts(item, seen, options));
  }

  const next: Record<string, any> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (key === "rawOoxml") {
      next.rawOoxmlAvailable = typeof entry === "string" && entry.length > 0;
      next.rawOoxmlLength = typeof entry === "string" ? entry.length : 0;
      continue;
    }
    if (key === "imageDataUri") {
      if (
        options.preservePreviewImages &&
        typeof entry === "string" &&
        entry.length > 0 &&
        entry.length <= PREVIEW_IMAGE_LIMIT
      ) {
        next.imageDataUri = entry;
      }
      next.imageAvailable = typeof entry === "string" && entry.length > 0;
      next.imageDataUriLength = typeof entry === "string" ? entry.length : 0;
      continue;
    }
    next[key] = stripLargeSourceArtifacts(entry, seen, options);
  }
  return next;
}

export function stripLargeSourceArtifactsForUploadExtraction(value: any): any {
  return stripLargeSourceArtifacts(value, new WeakSet<object>(), { preservePreviewImages: true });
}

export function sanitizeProtocolForReview<T>(protocol: T): T {
  return stripLargeSourceArtifacts(protocol) as T;
}

export function sanitizeProtocolForLocalCache<T>(protocol: T): T {
  const sanitized = stripLargeSourceArtifacts(protocol) as any;
  if (sanitized && typeof sanitized === "object" && "generatedProtocol" in sanitized) {
    sanitized.generatedProtocol = "[]";
    sanitized.generatedProtocolStoredInDatabase = true;
  }
  return sanitized as T;
}

export function summarizeForConsole(value: any, depth = 0): any {
  if (value == null || typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "string") {
    if (/^<w:tbl[\s\S]*<\/w:tbl>\s*$/i.test(value.trim())) {
      return `[Word table XML omitted: ${value.length} characters]`;
    }
    if (value.startsWith("data:image/")) return `[image data URI omitted: ${value.length} characters]`;
    return value.length > 1000 ? `${value.slice(0, 1000)}... [${value.length} chars]` : value;
  }
  if (depth >= 3) {
    if (Array.isArray(value)) return `[array ${value.length}]`;
    return `[object ${Object.keys(value).length} keys]`;
  }
  if (Array.isArray(value)) {
    const shown = value.slice(0, 8).map((item) => summarizeForConsole(item, depth + 1));
    return value.length > shown.length ? [...shown, `[${value.length - shown.length} more items]`] : shown;
  }
  if (typeof value === "object") {
    const next: Record<string, any> = {};
    for (const [key, entry] of Object.entries(value)) {
      if (key === "rawOoxml") {
        next[key] = typeof entry === "string" ? `[Word XML omitted: ${entry.length} chars]` : "[Word XML omitted]";
      } else if (key === "imageDataUri") {
        next[key] = typeof entry === "string" ? `[image omitted: ${entry.length} chars]` : "[image omitted]";
      } else {
        next[key] = summarizeForConsole(entry, depth + 1);
      }
    }
    return next;
  }
  return String(value);
}
