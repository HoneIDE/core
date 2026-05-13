/**
 * Parse AI response text into structured review annotations.
 *
 * Expected format from AI:
 * ```
 * [ANNOTATION]
 * file: path/to/file.ts
 * line: 42-45
 * severity: warning
 * category: performance
 * message: This loop could be optimized using a Map for O(1) lookups.
 * fix: const lookup = new Map(items.map(i => [i.id, i]));
 * [/ANNOTATION]
 * ```
 */

import type { ReviewAnnotation, AnnotationSeverity, AnnotationCategory } from './review-types';

let nextAnnotationId = 1;

/**
 * Parse annotations from AI response text.
 */
export function parseAnnotations(text: string): ReviewAnnotation[] {
  const annotations: ReviewAnnotation[] = [];
  let pos = 0;

  while (pos < text.length) {
    const start = text.indexOf('[ANNOTATION]', pos);
    if (start < 0) break;

    const end = text.indexOf('[/ANNOTATION]', start);
    if (end < 0) break;

    const block = text.slice(start + 12, end).trim();
    const annotation = parseAnnotationBlock(block);
    if (annotation) {
      annotations.push(annotation);
    }

    pos = end + 13;
  }

  return annotations;
}

function parseAnnotationBlock(block: string): ReviewAnnotation | null {
  const lines = block.split('\n');
  let filePath = '';
  let startLine = 0;
  let endLine = 0;
  let severity: AnnotationSeverity = 'suggestion';
  let category: AnnotationCategory = 'other';
  let message = '';
  let suggestedFix: string | undefined;
  let inFix = false;
  const fixLines: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (inFix) {
      fixLines.push(line);
      continue;
    }

    if (trimmed.startsWith('file:')) {
      filePath = trimmed.slice(5).trim();
    } else if (trimmed.startsWith('line:')) {
      const lineSpec = trimmed.slice(5).trim();
      const dashIdx = lineSpec.indexOf('-');
      if (dashIdx >= 0) {
        startLine = parseInt(lineSpec.slice(0, dashIdx), 10) || 0;
        endLine = parseInt(lineSpec.slice(dashIdx + 1), 10) || startLine;
      } else {
        startLine = parseInt(lineSpec, 10) || 0;
        endLine = startLine;
      }
    } else if (trimmed.startsWith('severity:')) {
      severity = parseSeverity(trimmed.slice(9).trim());
    } else if (trimmed.startsWith('category:')) {
      category = parseCategory(trimmed.slice(9).trim());
    } else if (trimmed.startsWith('message:')) {
      message = trimmed.slice(8).trim();
    } else if (trimmed.startsWith('fix:')) {
      inFix = true;
      const firstFixLine = trimmed.slice(4).trim();
      if (firstFixLine.length > 0) fixLines.push(firstFixLine);
    }
  }

  if (filePath.length === 0 || message.length === 0) return null;

  if (fixLines.length > 0) {
    suggestedFix = fixLines.join('\n').trim();
  }

  return {
    id: nextAnnotationId++,
    filePath,
    startLine,
    endLine,
    severity,
    category,
    message,
    suggestedFix,
    resolved: false,
  };
}

function parseSeverity(s: string): AnnotationSeverity {
  const lower = s.toLowerCase();
  if (lower === 'critical') return 'critical';
  if (lower === 'warning') return 'warning';
  if (lower === 'suggestion') return 'suggestion';
  if (lower === 'praise') return 'praise';
  return 'suggestion';
}

function parseCategory(s: string): AnnotationCategory {
  const lower = s.toLowerCase();
  if (lower === 'bug') return 'bug';
  if (lower === 'security') return 'security';
  if (lower === 'performance') return 'performance';
  if (lower === 'style') return 'style';
  if (lower === 'naming') return 'naming';
  if (lower === 'complexity') return 'complexity';
  if (lower === 'duplication') return 'duplication';
  if (lower === 'testing') return 'testing';
  if (lower === 'documentation') return 'documentation';
  return 'other';
}

/** Reset annotation ID counter (for testing). */
export function resetAnnotationIds(): void {
  nextAnnotationId = 1;
}

/**
 * Build the review prompt for the AI.
 */
export function buildReviewPrompt(diffContent: string, filePath: string): string {
  return `Review the following code changes in \`${filePath}\` and provide annotations.

For each issue found, use this format:
[ANNOTATION]
file: ${filePath}
line: <start>-<end>
severity: critical|warning|suggestion|praise
category: bug|security|performance|style|naming|complexity|duplication|testing|documentation|other
message: <description of the issue>
fix: <suggested fix code, if applicable>
[/ANNOTATION]

Diff:
${diffContent}`;
}
