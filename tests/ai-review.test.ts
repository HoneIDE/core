/**
 * Tests for Slice 13: AI PR Review system.
 */
import { describe, test, expect, beforeEach } from 'bun:test';
import {
  chunkDiff, estimateDiffTokens, groupChunksByFile,
  parseAnnotations, buildReviewPrompt, resetAnnotationIds,
  ReviewEngine,
  formatAnnotationsAsComments, formatReviewBody, shouldBlockMerge,
  type PRInfo, type ReviewAnnotation, type ReviewSummary,
} from '../src/ai/review/index';

// =============================================================================
// Diff Chunker
// =============================================================================

describe('Diff Chunker', () => {
  const sampleDiff = `diff --git a/src/main.ts b/src/main.ts
--- a/src/main.ts
+++ b/src/main.ts
@@ -1,5 +1,6 @@
 import { App } from './app';
+import { Config } from './config';

 const app = new App();
+app.configure(new Config());
 app.start();
diff --git a/src/config.ts b/src/config.ts
--- /dev/null
+++ b/src/config.ts
@@ -0,0 +1,5 @@
+export class Config {
+  debug = false;
+  port = 3000;
+}
`;

  test('chunks by file', () => {
    const chunks = chunkDiff(sampleDiff);
    expect(chunks.length).toBeGreaterThanOrEqual(2);
    expect(chunks[0].filePath).toBe('src/main.ts');
    expect(chunks[1].filePath).toBe('src/config.ts');
  });

  test('respects token limit', () => {
    // Create a large diff
    let bigDiff = 'diff --git a/big.ts b/big.ts\n--- a/big.ts\n+++ b/big.ts\n';
    for (let i = 0; i < 200; i++) {
      bigDiff += `+const line${i} = "value${i}";\n`;
    }
    const chunks = chunkDiff(bigDiff, 500);
    for (const chunk of chunks) {
      expect(chunk.estimatedTokens).toBeLessThanOrEqual(500);
    }
  });

  test('estimateDiffTokens approximates correctly', () => {
    const tokens = estimateDiffTokens('a'.repeat(400));
    expect(tokens).toBe(100);
  });

  test('groupChunksByFile groups correctly', () => {
    const chunks = chunkDiff(sampleDiff);
    const grouped = groupChunksByFile(chunks);
    expect(grouped.has('src/main.ts')).toBe(true);
    expect(grouped.has('src/config.ts')).toBe(true);
  });

  test('empty diff produces no chunks', () => {
    expect(chunkDiff('')).toHaveLength(0);
  });
});

// =============================================================================
// Annotation Parser
// =============================================================================

describe('Annotation Parser', () => {
  beforeEach(() => {
    resetAnnotationIds();
  });

  test('parses single annotation', () => {
    const text = `Some analysis text.
[ANNOTATION]
file: src/main.ts
line: 42-45
severity: warning
category: performance
message: This loop could be optimized.
[/ANNOTATION]
More text.`;

    const annotations = parseAnnotations(text);
    expect(annotations).toHaveLength(1);
    expect(annotations[0].filePath).toBe('src/main.ts');
    expect(annotations[0].startLine).toBe(42);
    expect(annotations[0].endLine).toBe(45);
    expect(annotations[0].severity).toBe('warning');
    expect(annotations[0].category).toBe('performance');
    expect(annotations[0].message).toBe('This loop could be optimized.');
    expect(annotations[0].resolved).toBe(false);
  });

  test('parses annotation with fix', () => {
    const text = `[ANNOTATION]
file: src/utils.ts
line: 10
severity: suggestion
category: style
message: Use const instead of let.
fix: const x = 1;
[/ANNOTATION]`;

    const annotations = parseAnnotations(text);
    expect(annotations[0].suggestedFix).toBe('const x = 1;');
  });

  test('parses multiple annotations', () => {
    const text = `[ANNOTATION]
file: a.ts
line: 1
severity: critical
category: bug
message: Null pointer.
[/ANNOTATION]
[ANNOTATION]
file: b.ts
line: 5
severity: praise
category: other
message: Well written code!
[/ANNOTATION]`;

    const annotations = parseAnnotations(text);
    expect(annotations).toHaveLength(2);
    expect(annotations[0].severity).toBe('critical');
    expect(annotations[1].severity).toBe('praise');
  });

  test('skips malformed annotations', () => {
    const text = `[ANNOTATION]
severity: warning
message: Missing file path
[/ANNOTATION]`;

    const annotations = parseAnnotations(text);
    expect(annotations).toHaveLength(0);
  });

  test('handles single line number', () => {
    const text = `[ANNOTATION]
file: a.ts
line: 10
severity: warning
category: bug
message: Issue here.
[/ANNOTATION]`;

    const annotations = parseAnnotations(text);
    expect(annotations[0].startLine).toBe(10);
    expect(annotations[0].endLine).toBe(10);
  });

  test('parses all severity levels', () => {
    for (const sev of ['critical', 'warning', 'suggestion', 'praise'] as const) {
      resetAnnotationIds();
      const text = `[ANNOTATION]\nfile: a.ts\nline: 1\nseverity: ${sev}\ncategory: other\nmessage: test\n[/ANNOTATION]`;
      const annotations = parseAnnotations(text);
      expect(annotations[0].severity).toBe(sev);
    }
  });

  test('parses all categories', () => {
    const cats = ['bug', 'security', 'performance', 'style', 'naming', 'complexity', 'duplication', 'testing', 'documentation', 'other'];
    for (const cat of cats) {
      resetAnnotationIds();
      const text = `[ANNOTATION]\nfile: a.ts\nline: 1\nseverity: warning\ncategory: ${cat}\nmessage: test\n[/ANNOTATION]`;
      const annotations = parseAnnotations(text);
      expect(annotations[0].category).toBe(cat);
    }
  });

  test('returns empty for no annotations', () => {
    expect(parseAnnotations('just regular text')).toHaveLength(0);
  });

  test('buildReviewPrompt includes diff and file', () => {
    const prompt = buildReviewPrompt('+ new line', 'src/main.ts');
    expect(prompt).toContain('src/main.ts');
    expect(prompt).toContain('+ new line');
    expect(prompt).toContain('[ANNOTATION]');
  });
});

// =============================================================================
// ReviewEngine
// =============================================================================

describe('ReviewEngine', () => {
  let engine: ReviewEngine;
  const testPR: PRInfo = {
    number: 42,
    title: 'Add config system',
    author: 'dev',
    baseBranch: 'main',
    headBranch: 'feature/config',
    changedFiles: ['src/config.ts', 'src/main.ts'],
    additions: 20,
    deletions: 5,
  };

  beforeEach(() => {
    resetAnnotationIds();
    engine = new ReviewEngine();
  });

  test('starts idle', () => {
    expect(engine.status).toBe('idle');
    expect(engine.getPRInfo()).toBeNull();
  });

  test('startReview sets PR info', () => {
    engine.startReview(testPR);
    expect(engine.status).toBe('chunking');
    expect(engine.getPRInfo()!.number).toBe(42);
  });

  test('prepareDiff returns chunks', () => {
    engine.startReview(testPR);
    const diff = `diff --git a/src/config.ts b/src/config.ts
--- /dev/null
+++ b/src/config.ts
@@ -0,0 +1,3 @@
+export class Config {
+  debug = false;
+}`;
    const chunks = engine.prepareDiff(diff);
    expect(chunks.length).toBeGreaterThan(0);
    expect(engine.status).toBe('reviewing');
  });

  test('processChunkResponse parses and stores annotations', () => {
    engine.startReview(testPR);
    const diff = `diff --git a/a.ts b/a.ts\n--- a/a.ts\n+++ b/a.ts\n+line`;
    engine.prepareDiff(diff);

    const response = `[ANNOTATION]
file: a.ts
line: 1
severity: warning
category: bug
message: Potential null reference.
[/ANNOTATION]`;

    const newAnns = engine.processChunkResponse(response);
    expect(newAnns).toHaveLength(1);
    expect(engine.getAnnotations()).toHaveLength(1);
    expect(engine.status).toBe('completed');
  });

  test('getAnnotationsForFile filters by file', () => {
    engine.startReview(testPR);
    engine.prepareDiff('diff --git a/a.ts b/a.ts\n--- a/a.ts\n+++ b/a.ts\n+x\ndiff --git a/b.ts b/b.ts\n--- a/b.ts\n+++ b/b.ts\n+y');

    engine.processChunkResponse(`[ANNOTATION]\nfile: a.ts\nline: 1\nseverity: warning\ncategory: bug\nmessage: Issue in a\n[/ANNOTATION]`);
    engine.processChunkResponse(`[ANNOTATION]\nfile: b.ts\nline: 1\nseverity: suggestion\ncategory: style\nmessage: Style issue in b\n[/ANNOTATION]`);

    expect(engine.getAnnotationsForFile('a.ts')).toHaveLength(1);
    expect(engine.getAnnotationsForFile('b.ts')).toHaveLength(1);
    expect(engine.getAnnotationsForFile('c.ts')).toHaveLength(0);
  });

  test('resolveAnnotation marks resolved', () => {
    engine.startReview(testPR);
    engine.prepareDiff('diff --git a/a.ts b/a.ts\n--- a/a.ts\n+++ b/a.ts\n+x');
    engine.processChunkResponse(`[ANNOTATION]\nfile: a.ts\nline: 1\nseverity: warning\ncategory: bug\nmessage: Bug\n[/ANNOTATION]`);

    const ann = engine.getAnnotations()[0];
    engine.resolveAnnotation(ann.id);
    expect(engine.getAnnotations()[0].resolved).toBe(true);
  });

  test('getSummary provides correct counts', () => {
    engine.startReview(testPR);
    engine.prepareDiff('diff --git a/a.ts b/a.ts\n--- a/a.ts\n+++ b/a.ts\n+x');

    const response = `[ANNOTATION]\nfile: a.ts\nline: 1\nseverity: critical\ncategory: bug\nmessage: Critical bug\n[/ANNOTATION]
[ANNOTATION]\nfile: a.ts\nline: 5\nseverity: warning\ncategory: style\nmessage: Style warning\n[/ANNOTATION]
[ANNOTATION]\nfile: a.ts\nline: 10\nseverity: praise\ncategory: other\nmessage: Nice code!\n[/ANNOTATION]`;

    engine.processChunkResponse(response);
    const summary = engine.getSummary();
    expect(summary.critical).toBe(1);
    expect(summary.warnings).toBe(1);
    expect(summary.praise).toBe(1);
    expect(summary.totalAnnotations).toBe(3);
    expect(summary.verdict).toBe('request_changes'); // has critical
  });

  test('getSummary approves when no issues', () => {
    engine.startReview(testPR);
    engine.prepareDiff('diff --git a/a.ts b/a.ts\n--- a/a.ts\n+++ b/a.ts\n+x');
    engine.processChunkResponse(`[ANNOTATION]\nfile: a.ts\nline: 1\nseverity: praise\ncategory: other\nmessage: LGTM\n[/ANNOTATION]`);
    expect(engine.getSummary().verdict).toBe('approve');
  });

  test('getProgress tracks chunks', () => {
    engine.startReview(testPR);
    engine.prepareDiff('diff --git a/a.ts b/a.ts\n--- a/a.ts\n+++ b/a.ts\n+x');
    const progress = engine.getProgress();
    expect(progress.total).toBeGreaterThan(0);
    expect(progress.reviewed).toBe(0);
  });

  test('fail marks status', () => {
    engine.startReview(testPR);
    engine.fail();
    expect(engine.status).toBe('failed');
  });

  test('reset clears everything', () => {
    engine.startReview(testPR);
    engine.reset();
    expect(engine.status).toBe('idle');
    expect(engine.getPRInfo()).toBeNull();
    expect(engine.getAnnotations()).toHaveLength(0);
  });
});

// =============================================================================
// Review Submitter
// =============================================================================

describe('Review Submitter', () => {
  test('formatAnnotationsAsComments basic', () => {
    const annotations: ReviewAnnotation[] = [
      { id: 1, filePath: 'src/main.ts', startLine: 10, endLine: 12, severity: 'warning', category: 'bug', message: 'Null check missing', resolved: false },
    ];
    const comments = formatAnnotationsAsComments(annotations);
    expect(comments).toHaveLength(1);
    expect(comments[0].path).toBe('src/main.ts');
    expect(comments[0].line).toBe(10);
    expect(comments[0].body).toContain('**[WARNING]**');
    expect(comments[0].body).toContain('bug');
    expect(comments[0].body).toContain('Null check missing');
  });

  test('formatAnnotationsAsComments with suggestion', () => {
    const annotations: ReviewAnnotation[] = [
      { id: 2, filePath: 'src/utils.ts', startLine: 5, endLine: 5, severity: 'suggestion', category: 'style', message: 'Use const', suggestedFix: 'const x = 1;', resolved: false },
    ];
    const comments = formatAnnotationsAsComments(annotations);
    expect(comments[0].body).toContain('Suggested fix:');
    expect(comments[0].body).toContain('const x = 1;');
  });

  test('formatAnnotationsAsComments empty returns empty', () => {
    const comments = formatAnnotationsAsComments([]);
    expect(comments).toHaveLength(0);
  });

  test('formatReviewBody includes all fields', () => {
    const summary: ReviewSummary = {
      totalAnnotations: 10,
      critical: 2,
      warnings: 3,
      suggestions: 4,
      praise: 1,
      verdict: 'request_changes',
      summary: 'Several issues found.',
    };
    const body = formatReviewBody(summary);
    expect(body).toContain('2 critical issue(s)');
    expect(body).toContain('3 warning(s)');
    expect(body).toContain('4 suggestion(s)');
    expect(body).toContain('1 positive(s)');
  });

  test('formatReviewBody no criticals omits critical line', () => {
    const summary: ReviewSummary = {
      totalAnnotations: 2,
      critical: 0,
      warnings: 1,
      suggestions: 1,
      praise: 0,
      verdict: 'comment',
      summary: 'Minor issues.',
    };
    const body = formatReviewBody(summary);
    expect(body).not.toContain('critical issue');
    expect(body).toContain('1 warning(s)');
  });

  test('shouldBlockMerge with criticals returns true', () => {
    const summary: ReviewSummary = {
      totalAnnotations: 3, critical: 1, warnings: 1, suggestions: 1, praise: 0,
      verdict: 'request_changes', summary: 'Critical issue found.',
    };
    expect(shouldBlockMerge(summary)).toBe(true);
  });

  test('shouldBlockMerge without criticals returns false', () => {
    const summary: ReviewSummary = {
      totalAnnotations: 2, critical: 0, warnings: 1, suggestions: 1, praise: 0,
      verdict: 'comment', summary: 'Minor issues.',
    };
    expect(shouldBlockMerge(summary)).toBe(false);
  });

  test('formatReviewBody header contains AI Code Review', () => {
    const summary: ReviewSummary = {
      totalAnnotations: 0, critical: 0, warnings: 0, suggestions: 0, praise: 0,
      verdict: 'approve', summary: 'LGTM',
    };
    const body = formatReviewBody(summary);
    expect(body).toContain('## AI Code Review');
    expect(body).toContain('Generated by Hone AI Review');
  });
});
