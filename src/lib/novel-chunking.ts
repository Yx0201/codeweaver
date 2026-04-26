const CHAPTER_HEADING_RE = /^\s*第\s*[0-9一二三四五六七八九十百千万零〇两]+\s*章(?:\s+.*)?$/u;
const VOLUME_HEADING_RE = /^\s*(?:第?\s*[0-9一二三四五六七八九十百千万零〇两]+\s*卷(?:\s*[\[【(（].*?[\]】)）])?|【第?\s*[0-9一二三四五六七八九十百千万零〇两]+\s*卷.*】)\s*$/u;
const VOLUME_END_RE = /^\s*【第?.*卷\s*完】\s*$/u;

const RETRIEVAL_PARENT_TARGET = 1400;
const RETRIEVAL_PARENT_MAX = 1800;
const RETRIEVAL_PARENT_OVERLAP = 1;

const RETRIEVAL_CHILD_TARGET = 650;
const RETRIEVAL_CHILD_MAX = 850;
const RETRIEVAL_CHILD_OVERLAP = 2;

const GRAPH_TARGET = 3000;
const GRAPH_MAX = 3600;
const GRAPH_OVERLAP = 0;

interface NovelSection {
  order: number;
  chapterTitle: string;
  volumeTitle: string | null;
  paragraphs: string[];
}

export interface RetrievalParentChunk {
  text: string;
  order: number;
  chapterTitle: string;
  volumeTitle: string | null;
  childChunks: string[];
  metadata: Record<string, unknown>;
}

export interface GraphChunkDescriptor {
  text: string;
  order: number;
  chapterTitle: string;
  volumeTitle: string | null;
  metadata: Record<string, unknown>;
}

interface ChunkGroup {
  parts: string[];
  partCount: number;
}

function normalizeLine(line: string): string {
  return line.replace(/\u3000/g, " ").replace(/\s+/g, " ").trim();
}

function normalizeText(text: string): string {
  return text.replace(/\r\n?/g, "\n");
}

function isChapterHeading(line: string): boolean {
  return CHAPTER_HEADING_RE.test(line);
}

function isVolumeHeading(line: string): boolean {
  return VOLUME_HEADING_RE.test(line);
}

function isVolumeEnd(line: string): boolean {
  return VOLUME_END_RE.test(line);
}

function splitIntoSentenceUnits(text: string): string[] {
  const normalized = normalizeLine(text);
  if (!normalized) return [];

  const pieces = normalized
    .split(/(?<=[。！？!?；;])/u)
    .map((part) => part.trim())
    .filter(Boolean);

  return pieces.length > 0 ? pieces : [normalized];
}

function ensureUnits(paragraphs: string[], maxChars: number): string[] {
  const units: string[] = [];

  for (const paragraph of paragraphs) {
    const normalized = normalizeLine(paragraph);
    if (!normalized) continue;

    if (normalized.length <= maxChars) {
      units.push(normalized);
      continue;
    }

    const sentenceUnits = splitIntoSentenceUnits(normalized);
    let buffer = "";

    for (const sentence of sentenceUnits) {
      const next = buffer ? `${buffer}${sentence}` : sentence;
      if (next.length > maxChars && buffer) {
        units.push(buffer);
        buffer = sentence;
      } else {
        buffer = next;
      }
    }

    if (buffer) {
      units.push(buffer);
    }
  }

  return units;
}

function buildGroups(
  units: string[],
  targetChars: number,
  maxChars: number,
  overlapUnits: number
): ChunkGroup[] {
  const groups: ChunkGroup[] = [];
  if (units.length === 0) return groups;

  let index = 0;

  while (index < units.length) {
    const start = index;
    const parts: string[] = [];
    let currentLength = 0;

    while (index < units.length) {
      const unit = units[index];
      const nextLength = currentLength === 0 ? unit.length : currentLength + 1 + unit.length;

      if (parts.length > 0 && nextLength > maxChars) {
        break;
      }

      parts.push(unit);
      currentLength = nextLength;
      index += 1;

      if (currentLength >= targetChars) {
        break;
      }
    }

    if (parts.length === 0) {
      parts.push(units[index]);
      index += 1;
    }

    groups.push({
      parts,
      partCount: parts.length,
    });

    if (index >= units.length) {
      break;
    }

    if (overlapUnits > 0) {
      index = Math.max(start + 1, index - overlapUnits);
    }
  }

  return groups;
}

function buildChunkText(
  chapterTitle: string,
  volumeTitle: string | null,
  parts: string[]
): string {
  const headings = [volumeTitle, chapterTitle].filter(Boolean);
  const body = parts.join("\n");

  if (headings.length === 0) {
    return body;
  }

  return `${headings.join("\n")}\n${body}`;
}

function splitNovelIntoSections(text: string): NovelSection[] {
  const lines = normalizeText(text).split("\n");
  const sections: NovelSection[] = [];

  let currentVolume: string | null = null;
  let currentChapter = "未命名章节";
  let currentParagraphs: string[] = [];
  let sectionOrder = 0;

  const flush = () => {
    if (currentParagraphs.length === 0) return;

    sections.push({
      order: sectionOrder,
      chapterTitle: currentChapter,
      volumeTitle: currentVolume,
      paragraphs: currentParagraphs,
    });

    sectionOrder += 1;
    currentParagraphs = [];
  };

  for (const rawLine of lines) {
    const line = normalizeLine(rawLine);

    if (!line) {
      continue;
    }

    if (isVolumeEnd(line)) {
      flush();
      continue;
    }

    if (isVolumeHeading(line)) {
      flush();
      currentVolume = line;
      continue;
    }

    if (isChapterHeading(line)) {
      flush();
      currentChapter = line;
      continue;
    }

    currentParagraphs.push(line);
  }

  flush();

  return sections;
}

export function buildNovelRetrievalChunks(text: string): RetrievalParentChunk[] {
  const sections = splitNovelIntoSections(text);
  const parents: RetrievalParentChunk[] = [];
  let chunkOrder = 0;

  for (const section of sections) {
    const parentUnits = ensureUnits(section.paragraphs, RETRIEVAL_PARENT_MAX);
    const parentGroups = buildGroups(
      parentUnits,
      RETRIEVAL_PARENT_TARGET,
      RETRIEVAL_PARENT_MAX,
      RETRIEVAL_PARENT_OVERLAP
    );

    for (const group of parentGroups) {
      const parentText = buildChunkText(section.chapterTitle, section.volumeTitle, group.parts);
      const childUnits = ensureUnits(group.parts, RETRIEVAL_CHILD_MAX);
      const childGroups = buildGroups(
        childUnits,
        RETRIEVAL_CHILD_TARGET,
        RETRIEVAL_CHILD_MAX,
        RETRIEVAL_CHILD_OVERLAP
      );

      parents.push({
        text: parentText,
        order: chunkOrder,
        chapterTitle: section.chapterTitle,
        volumeTitle: section.volumeTitle,
        childChunks: childGroups.map((childGroup) =>
          buildChunkText(section.chapterTitle, section.volumeTitle, childGroup.parts)
        ),
        metadata: {
          documentType: "novel",
          strategy: "retrieval",
          sectionOrder: section.order,
          paragraphCount: group.partCount,
        },
      });

      chunkOrder += 1;
    }
  }

  return parents;
}

export function buildNovelGraphChunks(text: string): GraphChunkDescriptor[] {
  const sections = splitNovelIntoSections(text);
  const graphChunks: GraphChunkDescriptor[] = [];
  let chunkOrder = 0;

  for (const section of sections) {
    const graphUnits = ensureUnits(section.paragraphs, GRAPH_MAX);
    const graphGroups = buildGroups(graphUnits, GRAPH_TARGET, GRAPH_MAX, GRAPH_OVERLAP);

    for (const group of graphGroups) {
      graphChunks.push({
        text: buildChunkText(section.chapterTitle, section.volumeTitle, group.parts),
        order: chunkOrder,
        chapterTitle: section.chapterTitle,
        volumeTitle: section.volumeTitle,
        metadata: {
          documentType: "novel",
          strategy: "graph",
          sectionOrder: section.order,
          paragraphCount: group.partCount,
          graph_processed: false,
        },
      });
      chunkOrder += 1;
    }
  }

  return graphChunks;
}
