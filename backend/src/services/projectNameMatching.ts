/** Normalize program_project names for comparison (not for storage). */
export function normalizeProjectName(name: string): string {
  return name
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[.,;:!?'"\-–—)]+$/g, '')
    .toLowerCase();
}

function levenshteinDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;

  const prev = new Array<number>(n + 1);
  const curr = new Array<number>(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;

  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    for (let j = 0; j <= n; j++) prev[j] = curr[j];
  }
  return prev[n];
}

/** Ratio in [0, 1] — 1 means identical after normalization. */
export function projectNameSimilarity(a: string, b: string): number {
  const left = normalizeProjectName(a);
  const right = normalizeProjectName(b);
  if (!left || !right) return 0;
  if (left === right) return 1;
  const maxLen = Math.max(left.length, right.length);
  return 1 - levenshteinDistance(left, right) / maxLen;
}

/**
 * Min similarity to emit a typo warning (not used for auto-merge).
 * Short names raise the bar to limit false positives.
 */
export function similarityWarningThreshold(normalizedLength: number): number {
  if (normalizedLength < 6) return 1.1;
  if (normalizedLength < 10) return 0.92;
  return 0.85;
}

export type ProgramProjectNameRow = { id: string; name: string };

export function findProgramProjectIdByNormalizedName(
  rawName: string,
  catalog: ProgramProjectNameRow[]
): string | null {
  const normalized = normalizeProjectName(rawName);
  if (!normalized) return null;
  for (const row of catalog) {
    if (normalizeProjectName(row.name) === normalized) return row.id;
  }
  return null;
}

export type SimilarProjectWarning = {
  existingId: string;
  existingName: string;
  similarity: number;
};

export function findSimilarProgramProject(
  rawName: string,
  catalog: ProgramProjectNameRow[]
): SimilarProjectWarning | null {
  const normalized = normalizeProjectName(rawName);
  if (!normalized) return null;
  if (findProgramProjectIdByNormalizedName(rawName, catalog)) return null;

  const threshold = similarityWarningThreshold(normalized.length);
  let best: SimilarProjectWarning | null = null;

  for (const row of catalog) {
    const sim = projectNameSimilarity(rawName, row.name);
    if (sim >= threshold && sim < 1 && (!best || sim > best.similarity)) {
      best = { existingId: row.id, existingName: row.name, similarity: sim };
    }
  }

  return best;
}

export function formatSimilarProjectHint(
  rowNumber: number,
  rawName: string,
  match: SimilarProjectWarning
): string {
  const pct = Math.round(match.similarity * 100);
  return `Row ${rowNumber}: project name '${rawName.trim()}' is similar to existing project '${match.existingName}' (${pct}% match) — check for a typo, or this will be created as a new project.`;
}
