/**
 * Review orchestration — manages the lifecycle of a PR review.
 */

import type { ReviewAnnotation, ReviewSummary, PRInfo } from './review-types';
import { chunkDiff } from './diff-chunker';
import { parseAnnotations } from './annotation-parser';

export type ReviewStatus = 'idle' | 'chunking' | 'reviewing' | 'completed' | 'failed';

export class ReviewEngine {
  private _status: ReviewStatus = 'idle';
  private annotations: ReviewAnnotation[] = [];
  private prInfo: PRInfo | null = null;
  private chunksTotal = 0;
  private chunksReviewed = 0;

  /** Get current status. */
  get status(): ReviewStatus {
    return this._status;
  }

  /** Get the PR info. */
  getPRInfo(): PRInfo | null {
    return this.prInfo;
  }

  /** Start a review for a PR. */
  startReview(pr: PRInfo): void {
    this.prInfo = pr;
    this.annotations = [];
    this._status = 'chunking';
    this.chunksTotal = 0;
    this.chunksReviewed = 0;
  }

  /**
   * Chunk the diff and return the chunks for sending to AI.
   * Returns the chunks so the caller can send them to the AI.
   */
  prepareDiff(diff: string, maxTokensPerChunk = 4000): { filePath: string; content: string }[] {
    const chunks = chunkDiff(diff, maxTokensPerChunk);
    this.chunksTotal = chunks.length;
    this.chunksReviewed = 0;
    this._status = 'reviewing';
    return chunks;
  }

  /**
   * Process an AI response for one chunk.
   * Parses annotations and adds them to the review.
   */
  processChunkResponse(responseText: string): ReviewAnnotation[] {
    const newAnnotations = parseAnnotations(responseText);
    for (let i = 0; i < newAnnotations.length; i++) {
      this.annotations.push(newAnnotations[i]);
    }
    this.chunksReviewed++;

    if (this.chunksReviewed >= this.chunksTotal) {
      this._status = 'completed';
    }

    return newAnnotations;
  }

  /** Get all annotations. */
  getAnnotations(): ReviewAnnotation[] {
    return this.annotations.slice();
  }

  /** Get annotations for a specific file. */
  getAnnotationsForFile(filePath: string): ReviewAnnotation[] {
    const result: ReviewAnnotation[] = [];
    for (let i = 0; i < this.annotations.length; i++) {
      if (this.annotations[i].filePath === filePath) {
        result.push(this.annotations[i]);
      }
    }
    return result;
  }

  /** Resolve an annotation. */
  resolveAnnotation(id: number): boolean {
    for (let i = 0; i < this.annotations.length; i++) {
      if (this.annotations[i].id === id) {
        this.annotations[i].resolved = true;
        return true;
      }
    }
    return false;
  }

  /** Get the review summary. */
  getSummary(): ReviewSummary {
    let critical = 0;
    let warnings = 0;
    let suggestions = 0;
    let praise = 0;

    for (let i = 0; i < this.annotations.length; i++) {
      const a = this.annotations[i];
      if (a.severity === 'critical') critical++;
      else if (a.severity === 'warning') warnings++;
      else if (a.severity === 'suggestion') suggestions++;
      else if (a.severity === 'praise') praise++;
    }

    let verdict: ReviewSummary['verdict'] = 'approve';
    if (critical > 0) verdict = 'request_changes';
    else if (warnings > 2) verdict = 'request_changes';
    else if (warnings > 0) verdict = 'comment';

    const summary = `Found ${this.annotations.length} items: ${critical} critical, ${warnings} warnings, ${suggestions} suggestions, ${praise} praise.`;

    return {
      totalAnnotations: this.annotations.length,
      critical,
      warnings,
      suggestions,
      praise,
      verdict,
      summary,
    };
  }

  /** Get review progress. */
  getProgress(): { reviewed: number; total: number } {
    return { reviewed: this.chunksReviewed, total: this.chunksTotal };
  }

  /** Mark review as failed. */
  fail(): void {
    this._status = 'failed';
  }

  /** Reset the engine. */
  reset(): void {
    this._status = 'idle';
    this.annotations = [];
    this.prInfo = null;
    this.chunksTotal = 0;
    this.chunksReviewed = 0;
  }
}
