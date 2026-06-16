type SupplementaryChunk = {
  id: string;
  text: string;
  sourceLabel: string;
  usage: string;
  type: "text" | "file" | "reference";
  index: number;
};

const CHUNK_SIZE = 1800;
const CHUNK_OVERLAP = 220;

function parseSupplementaryItems(supplementaryInfo: any): any[] {
  let items = supplementaryInfo;

  if (typeof items === "string") {
    try {
      items = JSON.parse(items);
    } catch {
      items = items.trim() ? [items] : [];
    }
  }

  if (!Array.isArray(items)) {
    items = items ? [items] : [];
  }

  return items;
}

function getQueryTerms(query: string): string[] {
  return Array.from(new Set(
    query
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter(term => term.length > 2)
  ));
}

export function createSupplementaryChunks(
  text: string,
  sourceLabel: string,
  usage: string,
  type: "text" | "file" | "reference",
  idPrefix: string
): SupplementaryChunk[] {
  const normalizedText = String(text || "").replace(/\s+/g, " ").trim();
  if (!normalizedText) return [];

  const chunks: SupplementaryChunk[] = [];
  let start = 0;

  while (start < normalizedText.length) {
    const end = Math.min(start + CHUNK_SIZE, normalizedText.length);
    const chunkText = normalizedText.slice(start, end).trim();
    if (chunkText) {
      chunks.push({
        id: `${idPrefix}-chunk-${chunks.length + 1}`,
        text: chunkText,
        sourceLabel,
        usage,
        type,
        index: chunks.length + 1
      });
    }
    if (end >= normalizedText.length) break;
    start = Math.max(0, end - CHUNK_OVERLAP);
  }

  return chunks;
}

export function retrieveSupplementaryChunks(
  supplementaryInfo: any,
  query = "",
  maxChunks = 8
): SupplementaryChunk[] {
  const items = parseSupplementaryItems(supplementaryInfo);
  const queryTerms = getQueryTerms(query);
  const allChunks: SupplementaryChunk[] = [];

  items.forEach((item: any, index: number) => {
    if (!item) return;

    if (typeof item === "string") {
      allChunks.push(...createSupplementaryChunks(
        item,
        `Supplementary note ${index + 1}`,
        "Use as supporting reference for protocol generation.",
        "text",
        `legacy-${index + 1}`
      ));
      return;
    }

    if (Array.isArray(item.ragChunks) && item.ragChunks.length > 0) {
      allChunks.push(...item.ragChunks);
      return;
    }

    const type = item.type || "text";
    const sourceLabel = item.fileName || item.text || `Supplementary item ${index + 1}`;
    const usage = item.context || "Use as supporting reference for protocol generation.";
    const content = item.fileContent || item.text || "";
    allChunks.push(...createSupplementaryChunks(content, sourceLabel, usage, type, item.id || `item-${index + 1}`));
  });

  if (allChunks.length <= maxChunks && queryTerms.length === 0) return allChunks;

  return allChunks
    .map(chunk => {
      const haystack = `${chunk.sourceLabel} ${chunk.usage} ${chunk.text}`.toLowerCase();
      const score = queryTerms.reduce((sum, term) => {
        const matches = haystack.split(term).length - 1;
        return sum + matches;
      }, 0);
      return { chunk, score };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, maxChunks)
    .map(item => item.chunk);
}

export function formatSupplementaryInfoForAI(supplementaryInfo: any, query = "", maxChunks = 8): string[] {
  const retrievedChunks = retrieveSupplementaryChunks(supplementaryInfo, query, maxChunks);

  if (retrievedChunks.length > 0) {
    return retrievedChunks.map(chunk => [
      `RETRIEVED SUPPLEMENTARY ${chunk.type.toUpperCase()} CHUNK: ${chunk.sourceLabel} (chunk ${chunk.index})`,
      `USAGE INSTRUCTION: ${chunk.usage}`,
      `CONTENT:\n${chunk.text}`
    ].join("\n"));
  }

  const items = parseSupplementaryItems(supplementaryInfo);

  return items
    .map((item: any, index: number) => {
      if (!item) return "";
      if (typeof item === "string") return item;

      const type = item.type || "text";
      const label = item.fileName || item.text || `Supplementary item ${index + 1}`;
      const usage = item.context || "Use as supporting reference for protocol generation.";
      const content = item.fileContent || item.text || "";

      return [
        `SUPPLEMENTARY ${String(type).toUpperCase()}: ${label}`,
        `USAGE INSTRUCTION: ${usage}`,
        content ? `CONTENT:\n${String(content).slice(0, 30000)}` : ""
      ].filter(Boolean).join("\n");
    })
    .filter((item: string) => item.trim().length > 0);
}
