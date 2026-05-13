/**
 * Tests for Slice 10: AI Chat system.
 */
import { describe, test, expect, beforeEach } from 'bun:test';
import {
  ChatModel, extractCodeBlocks, resetIds,
  ContextCollector,
  StreamingRenderer, splitMarkdownSegments,
  buildCodeActionPrompt, getCodeActionLabel, CODE_ACTION_TYPES,
  type CodeActionRequest,
} from '../src/ai/chat/index';

// =============================================================================
// ChatModel
// =============================================================================

describe('ChatModel', () => {
  let model: ChatModel;

  beforeEach(() => {
    resetIds();
    model = new ChatModel();
  });

  test('starts with no sessions', () => {
    expect(model.sessionCount).toBe(0);
    expect(model.getActiveSession()).toBeNull();
  });

  test('createSession adds a session', () => {
    const session = model.createSession('Test Chat');
    expect(session.id).toBe('session_1');
    expect(session.title).toBe('Test Chat');
    expect(model.sessionCount).toBe(1);
  });

  test('first session becomes active', () => {
    model.createSession('First');
    expect(model.getActiveSession()).not.toBeNull();
    expect(model.getActiveSession()!.title).toBe('First');
  });

  test('setActiveSession switches active', () => {
    model.createSession('First');
    const s2 = model.createSession('Second');
    model.setActiveSession(s2.id);
    expect(model.getActiveSession()!.title).toBe('Second');
  });

  test('setActiveSession returns false for invalid id', () => {
    expect(model.setActiveSession('nonexistent')).toBe(false);
  });

  test('deleteSession removes session', () => {
    const s1 = model.createSession('First');
    model.createSession('Second');
    model.deleteSession(s1.id);
    expect(model.sessionCount).toBe(1);
  });

  test('deleting active session switches to first remaining', () => {
    const s1 = model.createSession('First');
    model.createSession('Second');
    model.setActiveSession(s1.id);
    model.deleteSession(s1.id);
    expect(model.getActiveSession()!.title).toBe('Second');
  });

  test('renameSession changes title', () => {
    const s = model.createSession('Old');
    model.renameSession(s.id, 'New');
    expect(model.getSession(s.id)!.title).toBe('New');
  });

  test('addUserMessage adds to active session', () => {
    model.createSession('Test');
    const msg = model.addUserMessage('Hello');
    expect(msg).not.toBeNull();
    expect(msg!.role).toBe('user');
    expect(msg!.content).toBe('Hello');
    expect(model.getMessageCount()).toBe(1);
  });

  test('addUserMessage returns null with no active session', () => {
    expect(model.addUserMessage('hi')).toBeNull();
  });

  test('startAssistantMessage creates streaming message', () => {
    model.createSession('Test');
    const msg = model.startAssistantMessage();
    expect(msg).not.toBeNull();
    expect(msg!.role).toBe('assistant');
    expect(msg!.isStreaming).toBe(true);
    expect(msg!.content).toBe('');
  });

  test('appendToLastMessage adds text during streaming', () => {
    model.createSession('Test');
    model.startAssistantMessage();
    model.appendToLastMessage('Hello ');
    model.appendToLastMessage('world');
    const session = model.getActiveSession()!;
    expect(session.messages[0].content).toBe('Hello world');
  });

  test('appendToLastMessage fails on non-streaming message', () => {
    model.createSession('Test');
    model.addUserMessage('hi');
    expect(model.appendToLastMessage('nope')).toBe(false);
  });

  test('finalizeLastMessage ends streaming', () => {
    model.createSession('Test');
    model.startAssistantMessage();
    model.appendToLastMessage('Done');
    model.finalizeLastMessage();
    const session = model.getActiveSession()!;
    expect(session.messages[0].isStreaming).toBe(false);
  });

  test('getMessagesForAPI includes system prompt', () => {
    model.createSession('Test', 'You are helpful');
    model.addUserMessage('Hi');
    model.startAssistantMessage();
    model.appendToLastMessage('Hello');
    model.finalizeLastMessage();

    const msgs = model.getMessagesForAPI();
    expect(msgs.length).toBe(3);
    expect(msgs[0].role).toBe('system');
    expect(msgs[0].content).toBe('You are helpful');
    expect(msgs[1].role).toBe('user');
    expect(msgs[2].role).toBe('assistant');
  });

  test('clearMessages empties session', () => {
    model.createSession('Test');
    model.addUserMessage('hi');
    model.addUserMessage('there');
    model.clearMessages();
    expect(model.getMessageCount()).toBe(0);
  });

  test('getAllSessions returns all', () => {
    model.createSession('A');
    model.createSession('B');
    expect(model.getAllSessions()).toHaveLength(2);
  });
});

// =============================================================================
// extractCodeBlocks
// =============================================================================

describe('extractCodeBlocks', () => {
  test('extracts single code block', () => {
    const content = 'Here is code:\n```typescript\nconst x = 1;\n```\nDone.';
    const blocks = extractCodeBlocks(content);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].language).toBe('typescript');
    expect(blocks[0].code).toBe('const x = 1;\n');
  });

  test('extracts multiple code blocks', () => {
    const content = '```js\na\n```\ntext\n```py\nb\n```';
    const blocks = extractCodeBlocks(content);
    expect(blocks).toHaveLength(2);
    expect(blocks[0].language).toBe('js');
    expect(blocks[1].language).toBe('py');
  });

  test('handles code block without language', () => {
    const content = '```\nhello\n```';
    const blocks = extractCodeBlocks(content);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].language).toBe('text');
  });

  test('returns empty for no code blocks', () => {
    expect(extractCodeBlocks('just text')).toHaveLength(0);
  });

  test('handles unclosed code block', () => {
    const content = '```ts\nfoo';
    const blocks = extractCodeBlocks(content);
    expect(blocks).toHaveLength(0);
  });
});

// =============================================================================
// ContextCollector
// =============================================================================

describe('ContextCollector', () => {
  let collector: ContextCollector;

  beforeEach(() => {
    collector = new ContextCollector();
  });

  test('starts empty', () => {
    expect(collector.count).toBe(0);
  });

  test('addFile', () => {
    collector.addFile('src/main.ts', 'const x = 1;');
    expect(collector.count).toBe(1);
    expect(collector.getItems()[0].type).toBe('file');
    expect(collector.getItems()[0].included).toBe(true);
  });

  test('addSelection', () => {
    collector.addSelection('file.ts', 'selected text', 10, 20);
    expect(collector.getItems()[0].type).toBe('selection');
    expect(collector.getItems()[0].label).toBe('file.ts:10-20');
  });

  test('addDiagnostics', () => {
    collector.addDiagnostics('file.ts', 'Error: type mismatch');
    expect(collector.getItems()[0].type).toBe('diagnostics');
  });

  test('addTerminalOutput', () => {
    collector.addTerminalOutput('$ npm test\nPASS');
    expect(collector.getItems()[0].type).toBe('terminal');
  });

  test('addGitDiff', () => {
    collector.addGitDiff('+ added line');
    expect(collector.getItems()[0].type).toBe('git_diff');
  });

  test('toggleItem', () => {
    collector.addFile('a.ts', 'content');
    collector.toggleItem(0);
    expect(collector.getItems()[0].included).toBe(false);
    collector.toggleItem(0);
    expect(collector.getItems()[0].included).toBe(true);
  });

  test('toggleItem invalid index', () => {
    expect(collector.toggleItem(99)).toBe(false);
  });

  test('removeItem', () => {
    collector.addFile('a.ts', 'a');
    collector.addFile('b.ts', 'b');
    collector.removeItem(0);
    expect(collector.count).toBe(1);
    expect(collector.getItems()[0].label).toBe('b.ts');
  });

  test('getIncludedCount', () => {
    collector.addFile('a.ts', 'a');
    collector.addFile('b.ts', 'b');
    collector.toggleItem(1);
    expect(collector.getIncludedCount()).toBe(1);
  });

  test('getSnapshot estimates tokens', () => {
    collector.addFile('a.ts', 'a'.repeat(100));
    const snap = collector.getSnapshot();
    expect(snap.estimatedTokens).toBe(25); // 100/4
  });

  test('buildContextPrompt formats items', () => {
    collector.addFile('main.ts', 'code here');
    collector.addGitDiff('+ new line');
    const prompt = collector.buildContextPrompt();
    expect(prompt).toContain('<file path="main.ts">');
    expect(prompt).toContain('<git_diff>');
  });

  test('buildContextPrompt excludes toggled-off items', () => {
    collector.addFile('a.ts', 'code');
    collector.toggleItem(0);
    expect(collector.buildContextPrompt()).toBe('');
  });

  test('clear removes all', () => {
    collector.addFile('a.ts', 'a');
    collector.addFile('b.ts', 'b');
    collector.clear();
    expect(collector.count).toBe(0);
  });
});

// =============================================================================
// StreamingRenderer
// =============================================================================

describe('StreamingRenderer', () => {
  let renderer: StreamingRenderer;

  beforeEach(() => {
    renderer = new StreamingRenderer();
  });

  test('starts empty', () => {
    const state = renderer.getState();
    expect(state.text).toBe('');
    expect(state.inCodeBlock).toBe(false);
    expect(state.done).toBe(false);
  });

  test('append accumulates text', () => {
    renderer.append('Hello ');
    renderer.append('world');
    expect(renderer.getText()).toBe('Hello world');
  });

  test('detects code block opening', () => {
    renderer.append('Here:\n```typescript\nconst ');
    const state = renderer.getState();
    expect(state.inCodeBlock).toBe(true);
    expect(state.codeBlockLanguage).toBe('typescript');
  });

  test('detects code block closing', () => {
    renderer.append('```ts\ncode\n```\n');
    const state = renderer.getState();
    expect(state.inCodeBlock).toBe(false);
    expect(state.completedBlocks).toBe(1);
  });

  test('counts multiple code blocks', () => {
    renderer.append('```js\na\n```\ntext\n```py\nb\n```\n');
    expect(renderer.getState().completedBlocks).toBe(2);
  });

  test('finish marks done', () => {
    renderer.append('text');
    const state = renderer.finish();
    expect(state.done).toBe(true);
  });

  test('reset clears state', () => {
    renderer.append('something');
    renderer.reset();
    expect(renderer.getText()).toBe('');
    expect(renderer.getState().done).toBe(false);
  });

  test('handles code block with no language', () => {
    renderer.append('```\nplain code\n```\n');
    const state = renderer.getState();
    expect(state.inCodeBlock).toBe(false);
    expect(state.completedBlocks).toBe(1);
  });

  test('tracks language through incremental appends', () => {
    renderer.append('text\n``');
    expect(renderer.getState().inCodeBlock).toBe(false);
    renderer.append('`python\nimport os\n```');
    expect(renderer.getState().inCodeBlock).toBe(false);
    expect(renderer.getState().completedBlocks).toBe(1);
  });
});

// =============================================================================
// splitMarkdownSegments
// =============================================================================

describe('splitMarkdownSegments', () => {
  test('plain text only', () => {
    const segs = splitMarkdownSegments('Hello world');
    expect(segs).toHaveLength(1);
    expect(segs[0].type).toBe('text');
  });

  test('single code block', () => {
    const segs = splitMarkdownSegments('before\n```ts\ncode\n```\nafter');
    expect(segs).toHaveLength(3);
    expect(segs[0].type).toBe('text');
    expect(segs[1].type).toBe('code');
    expect(segs[1].language).toBe('ts');
    expect(segs[1].content).toBe('code\n');
    expect(segs[2].type).toBe('text');
  });

  test('multiple code blocks', () => {
    const segs = splitMarkdownSegments('```a\n1\n```\n```b\n2\n```');
    expect(segs).toHaveLength(3); // code, text (newline), code
    expect(segs[0].type).toBe('code');
    expect(segs[2].type).toBe('code');
  });

  test('unclosed code block treated as code', () => {
    const segs = splitMarkdownSegments('```ts\nopen code');
    expect(segs).toHaveLength(1);
    expect(segs[0].type).toBe('code');
  });

  test('empty text returns empty', () => {
    expect(splitMarkdownSegments('')).toHaveLength(0);
  });
});

// =============================================================================
// Code Actions
// =============================================================================

describe('Code Actions', () => {
  const baseReq: CodeActionRequest = {
    type: 'explain',
    code: 'const x = 1;',
    language: 'typescript',
    filePath: 'test.ts',
  };

  test('explain action includes code', () => {
    const prompt = buildCodeActionPrompt(baseReq);
    expect(prompt.userMessage).toContain('Explain');
    expect(prompt.userMessage).toContain('const x = 1;');
    expect(prompt.userMessage).toContain('test.ts');
  });

  test('refactor action', () => {
    const prompt = buildCodeActionPrompt({ ...baseReq, type: 'refactor' });
    expect(prompt.userMessage).toContain('Refactor');
  });

  test('fix action with context', () => {
    const prompt = buildCodeActionPrompt({
      ...baseReq,
      type: 'fix',
      context: 'TypeError: x is not a function',
    });
    expect(prompt.userMessage).toContain('Fix');
    expect(prompt.userMessage).toContain('TypeError');
  });

  test('test action', () => {
    const prompt = buildCodeActionPrompt({ ...baseReq, type: 'test' });
    expect(prompt.userMessage).toContain('tests');
  });

  test('document action', () => {
    const prompt = buildCodeActionPrompt({ ...baseReq, type: 'document' });
    expect(prompt.userMessage).toContain('documentation');
  });

  test('optimize action', () => {
    const prompt = buildCodeActionPrompt({ ...baseReq, type: 'optimize' });
    expect(prompt.userMessage).toContain('Optimize');
  });

  test('getCodeActionLabel returns labels', () => {
    expect(getCodeActionLabel('explain')).toBe('Explain');
    expect(getCodeActionLabel('fix')).toBe('Fix');
    expect(getCodeActionLabel('test')).toBe('Write Tests');
  });

  test('CODE_ACTION_TYPES has all types', () => {
    expect(CODE_ACTION_TYPES).toHaveLength(6);
    expect(CODE_ACTION_TYPES).toContain('explain');
    expect(CODE_ACTION_TYPES).toContain('optimize');
  });
});
