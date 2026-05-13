/**
 * Types for AI PR Review system.
 */

export type AnnotationSeverity = 'critical' | 'warning' | 'suggestion' | 'praise';

export type AnnotationCategory =
  | 'bug'
  | 'security'
  | 'performance'
  | 'style'
  | 'naming'
  | 'complexity'
  | 'duplication'
  | 'testing'
  | 'documentation'
  | 'other';

export interface ReviewAnnotation {
  id: number;
  filePath: string;
  startLine: number;
  endLine: number;
  severity: AnnotationSeverity;
  category: AnnotationCategory;
  message: string;
  /** Suggested fix (if any) */
  suggestedFix?: string;
  /** Whether the user has addressed this annotation */
  resolved: boolean;
}

export interface ReviewSummary {
  totalAnnotations: number;
  critical: number;
  warnings: number;
  suggestions: number;
  praise: number;
  /** Overall verdict */
  verdict: 'approve' | 'request_changes' | 'comment';
  /** Summary text */
  summary: string;
}

export interface PRInfo {
  number: number;
  title: string;
  author: string;
  baseBranch: string;
  headBranch: string;
  /** File paths changed */
  changedFiles: string[];
  additions: number;
  deletions: number;
}
