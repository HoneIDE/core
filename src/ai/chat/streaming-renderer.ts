/**
 * Streaming markdown accumulation — processes incremental text chunks
 * and tracks code block boundaries for rendering.
 */

export interface StreamState {
  /** Full accumulated text so far */
  text: string;
  /** Whether we're currently inside a code block */
  inCodeBlock: boolean;
  /** Current code block language (if in code block) */
  codeBlockLanguage: string;
  /** Number of completed code blocks */
  completedBlocks: number;
  /** Whether streaming is finished */
  done: boolean;
}

export class StreamingRenderer {
  private text = '';
  private inCodeBlock = false;
  private codeBlockLanguage = '';
  private completedBlocks = 0;
  private done = false;

  /** Reset the renderer for a new stream. */
  reset(): void {
    this.text = '';
    this.inCodeBlock = false;
    this.codeBlockLanguage = '';
    this.completedBlocks = 0;
    this.done = false;
  }

  /** Append a chunk of text. Returns the updated state. */
  append(chunk: string): StreamState {
    this.text += chunk;
    this.scanForCodeBlocks();
    return this.getState();
  }

  /** Mark the stream as done. */
  finish(): StreamState {
    this.done = true;
    return this.getState();
  }

  /** Get current state. */
  getState(): StreamState {
    return {
      text: this.text,
      inCodeBlock: this.inCodeBlock,
      codeBlockLanguage: this.codeBlockLanguage,
      completedBlocks: this.completedBlocks,
      done: this.done,
    };
  }

  /** Get the full accumulated text. */
  getText(): string {
    return this.text;
  }

  /**
   * Scan the accumulated text for code block boundaries.
   * We track ``` markers to know if we're inside a code block.
   */
  private scanForCodeBlocks(): void {
    let inBlock = false;
    let blockCount = 0;
    let lang = '';
    let pos = 0;
    const text = this.text;

    while (pos < text.length) {
      // Look for ```
      if (pos + 2 < text.length &&
          text.charCodeAt(pos) === 96 &&
          text.charCodeAt(pos + 1) === 96 &&
          text.charCodeAt(pos + 2) === 96) {
        if (!inBlock) {
          // Opening — read language
          inBlock = true;
          pos += 3;
          let langStart = pos;
          while (pos < text.length && text.charCodeAt(pos) !== 10) {
            pos++;
          }
          lang = text.slice(langStart, pos).trim();
        } else {
          // Closing
          inBlock = false;
          lang = '';
          blockCount++;
          pos += 3;
        }
      } else {
        pos++;
      }
    }

    this.inCodeBlock = inBlock;
    this.codeBlockLanguage = lang;
    this.completedBlocks = blockCount;
  }
}

/**
 * Split streamed markdown text into segments for rendering.
 * Each segment is either plain text or a code block.
 */
export interface MarkdownSegment {
  type: 'text' | 'code';
  content: string;
  language?: string;
}

export function splitMarkdownSegments(text: string): MarkdownSegment[] {
  const segments: MarkdownSegment[] = [];
  let pos = 0;

  while (pos < text.length) {
    const tripleBacktick = text.indexOf('```', pos);
    if (tripleBacktick < 0) {
      // Rest is plain text
      const rest = text.slice(pos);
      if (rest.length > 0) {
        segments.push({ type: 'text', content: rest });
      }
      break;
    }

    // Text before code block
    if (tripleBacktick > pos) {
      segments.push({ type: 'text', content: text.slice(pos, tripleBacktick) });
    }

    // Find language
    let langEnd = tripleBacktick + 3;
    while (langEnd < text.length && text.charCodeAt(langEnd) !== 10) {
      langEnd++;
    }
    const language = text.slice(tripleBacktick + 3, langEnd).trim();

    // Find closing ```
    const codeStart = langEnd + 1;
    const closingBacktick = text.indexOf('```', codeStart);
    if (closingBacktick < 0) {
      // Unclosed code block — treat rest as code
      segments.push({
        type: 'code',
        content: text.slice(codeStart),
        language: language || 'text',
      });
      break;
    }

    segments.push({
      type: 'code',
      content: text.slice(codeStart, closingBacktick),
      language: language || 'text',
    });
    pos = closingBacktick + 3;
  }

  return segments;
}
