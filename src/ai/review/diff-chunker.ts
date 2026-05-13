/**
 * Split a diff into AI-digestible chunks, respecting token limits.
 */

export interface DiffChunk {
  filePath: string;
  /** The diff content for this chunk */
  content: string;
  /** Estimated token count */
  estimatedTokens: number;
  /** Start line in the original diff */
  startLine: number;
}

/**
 * Split a unified diff into chunks that fit within a token limit.
 *
 * @param diff The full unified diff text
 * @param maxTokensPerChunk Max tokens per chunk (default 4000)
 */
export function chunkDiff(diff: string, maxTokensPerChunk = 4000): DiffChunk[] {
  const chunks: DiffChunk[] = [];
  const lines = diff.split('\n');
  let currentFile = '';
  let currentLines: string[] = [];
  let currentStartLine = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Detect file header
    if (line.startsWith('diff --git ') || line.startsWith('--- ') || line.startsWith('+++ ')) {
      if (line.startsWith('+++ ') && line.length > 6) {
        // Flush current chunk
        if (currentLines.length > 0 && currentFile.length > 0) {
          flushChunk(chunks, currentFile, currentLines, currentStartLine, maxTokensPerChunk);
        }
        // Extract file path (skip "+++ b/" prefix)
        currentFile = line.startsWith('+++ b/') ? line.slice(6) : line.slice(4);
        currentLines = [];
        currentStartLine = i;
      }
      continue;
    }

    currentLines.push(line);

    // Check if current chunk is getting too large
    const est = estimateTokenCount(currentLines.join('\n'));
    if (est > maxTokensPerChunk && currentLines.length > 10) {
      flushChunk(chunks, currentFile, currentLines, currentStartLine, maxTokensPerChunk);
      currentLines = [];
      currentStartLine = i + 1;
    }
  }

  // Flush remaining
  if (currentLines.length > 0 && currentFile.length > 0) {
    flushChunk(chunks, currentFile, currentLines, currentStartLine, maxTokensPerChunk);
  }

  return chunks;
}

function flushChunk(
  chunks: DiffChunk[],
  filePath: string,
  lines: string[],
  startLine: number,
  maxTokens: number,
): void {
  const content = lines.join('\n');
  const tokens = estimateTokenCount(content);

  if (tokens <= maxTokens) {
    chunks.push({ filePath, content, estimatedTokens: tokens, startLine });
  } else {
    // Split in half recursively
    const mid = Math.floor(lines.length / 2);
    const firstHalf = lines.slice(0, mid);
    const secondHalf = lines.slice(mid);
    if (firstHalf.length > 0) {
      flushChunk(chunks, filePath, firstHalf, startLine, maxTokens);
    }
    if (secondHalf.length > 0) {
      flushChunk(chunks, filePath, secondHalf, startLine + mid, maxTokens);
    }
  }
}

function estimateTokenCount(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Get the total estimated tokens for a diff.
 */
export function estimateDiffTokens(diff: string): number {
  return estimateTokenCount(diff);
}

/**
 * Group chunks by file path.
 */
export function groupChunksByFile(chunks: DiffChunk[]): Map<string, DiffChunk[]> {
  const grouped = new Map<string, DiffChunk[]>();
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const existing = grouped.get(chunk.filePath);
    if (existing) {
      existing.push(chunk);
    } else {
      grouped.set(chunk.filePath, [chunk]);
    }
  }
  return grouped;
}
