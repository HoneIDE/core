import { describe, test, expect, beforeEach } from 'bun:test';
import { EditorHandler, resetEditorHandlerIds } from '../src/sync/handlers/editor-handler';
import { AiHandler } from '../src/sync/handlers/ai-handler';
import { BuildHandler } from '../src/sync/handlers/build-handler';
import { FilesHandler, type FileSystemAdapter } from '../src/sync/handlers/files-handler';
import { ChatModel, resetIds } from '../src/ai/chat/chat-model';
import { TaskRunner, resetTaskRunnerIds } from '../src/tasks/task-runner';

// --- Mock FileSystem ---

class MockFS implements FileSystemAdapter {
  files: Map<string, string> = new Map();

  async readFile(path: string): Promise<string> {
    const content = this.files.get(path);
    if (content === undefined) throw new Error(`File not found: ${path}`);
    return content;
  }

  async writeFile(path: string, content: string): Promise<void> {
    this.files.set(path, content);
  }

  async deleteFile(path: string): Promise<void> {
    this.files.delete(path);
  }

  async moveFile(oldPath: string, newPath: string): Promise<void> {
    const content = this.files.get(oldPath);
    if (content !== undefined) {
      this.files.set(newPath, content);
      this.files.delete(oldPath);
    }
  }

  async readDirectory(path: string): Promise<Array<{ name: string; path: string; type: 'file' | 'directory' }>> {
    return [{ name: 'test.ts', path: path + '/test.ts', type: 'file' }];
  }

  async exists(path: string): Promise<boolean> {
    return this.files.has(path);
  }
}

// --- Editor Handler ---

describe('EditorHandler', () => {
  let handler: EditorHandler;

  beforeEach(() => {
    resetEditorHandlerIds();
    handler = new EditorHandler();
  });

  test('openTabs returns empty initially', async () => {
    const result = await handler.handle('openTabs', {});
    expect(result.tabs).toEqual([]);
  });

  test('openFile creates a tab', async () => {
    const result = await handler.handle('openFile', { path: '/project/src/main.ts' });
    const tab = result.tab as any;
    expect(tab.id).toBe('tab_1');
    expect(tab.filePath).toBe('/project/src/main.ts');
    expect(tab.fileName).toBe('main.ts');
    expect(tab.isActive).toBe(true);
  });

  test('openFile twice reactivates existing tab', async () => {
    await handler.handle('openFile', { path: '/project/a.ts' });
    await handler.handle('openFile', { path: '/project/b.ts' });
    const result = await handler.handle('openFile', { path: '/project/a.ts' });
    const tab = result.tab as any;
    expect(tab.id).toBe('tab_1');
    expect(tab.isActive).toBe(true);
  });

  test('closeFile removes tab', async () => {
    await handler.handle('openFile', { path: '/project/a.ts' });
    const result = await handler.handle('closeFile', { tabId: 'tab_1' });
    expect(result.success).toBe(true);
    const tabs = await handler.handle('openTabs', {});
    expect((tabs.tabs as any[]).length).toBe(0);
  });

  test('closeFile activates adjacent tab', async () => {
    await handler.handle('openFile', { path: '/project/a.ts' });
    await handler.handle('openFile', { path: '/project/b.ts' });
    await handler.handle('closeFile', { tabId: 'tab_2' });
    const tabs = (await handler.handle('openTabs', {})).tabs as any[];
    expect(tabs[0].isActive).toBe(true);
  });

  test('cursor and setCursor', async () => {
    await handler.handle('openFile', { path: '/project/a.ts' });
    await handler.handle('setCursor', { tabId: 'tab_1', position: { line: 10, column: 5 } });
    const cursor = await handler.handle('cursor', { tabId: 'tab_1' });
    expect((cursor.position as any).line).toBe(10);
    expect((cursor.position as any).column).toBe(5);
  });

  test('viewport returns default range', async () => {
    await handler.handle('openFile', { path: '/project/a.ts' });
    const vp = await handler.handle('viewport', { tabId: 'tab_1' });
    expect((vp.range as any).startLine).toBe(1);
    expect((vp.range as any).endLine).toBe(50);
  });

  test('unknown operation throws', async () => {
    try {
      await handler.handle('nonexistent', {});
      expect(true).toBe(false); // should not reach
    } catch (e: any) {
      expect(e.message).toContain('Unknown operation');
    }
  });

  test('getSubscribableEvents includes onTabChanged', () => {
    expect(handler.getSubscribableEvents()).toContain('onTabChanged');
  });
});

// --- AI Handler ---

describe('AiHandler', () => {
  let handler: AiHandler;
  let chatModel: ChatModel;

  beforeEach(() => {
    resetIds();
    chatModel = new ChatModel();
    handler = new AiHandler(chatModel);
  });

  test('conversations returns empty initially', async () => {
    const result = await handler.handle('conversations', {});
    expect((result.conversations as any[]).length).toBe(0);
  });

  test('send creates session if none provided', async () => {
    const result = await handler.handle('send', { message: 'Hello' });
    expect(result.conversationId).toBeDefined();
    expect(result.messageId).toBeDefined();
  });

  test('send adds to existing conversation', async () => {
    const r1 = await handler.handle('send', { message: 'Hello' });
    const r2 = await handler.handle('send', { conversationId: r1.conversationId, message: 'Follow up' });
    expect(r2.conversationId).toBe(r1.conversationId);
  });

  test('conversations lists created sessions', async () => {
    await handler.handle('send', { message: 'Hello' });
    const result = await handler.handle('conversations', {});
    const convos = result.conversations as any[];
    expect(convos.length).toBe(1);
    expect(convos[0].messageCount).toBe(1);
  });

  test('history returns messages', async () => {
    const r1 = await handler.handle('send', { message: 'Hello' });
    const result = await handler.handle('history', { conversationId: r1.conversationId });
    const messages = result.messages as any[];
    expect(messages.length).toBe(1);
    expect(messages[0].content).toBe('Hello');
    expect(result.total).toBe(1);
  });

  test('history with limit and offset', async () => {
    const r1 = await handler.handle('send', { message: 'One' });
    await handler.handle('send', { conversationId: r1.conversationId, message: 'Two' });
    await handler.handle('send', { conversationId: r1.conversationId, message: 'Three' });

    const result = await handler.handle('history', { conversationId: r1.conversationId, limit: 1, offset: 1 });
    const messages = result.messages as any[];
    expect(messages.length).toBe(1);
    expect(messages[0].content).toBe('Two');
  });

  test('history for unknown conversation throws', async () => {
    try {
      await handler.handle('history', { conversationId: 'nonexistent' });
      expect(true).toBe(false);
    } catch (e: any) {
      expect(e.message).toContain('not found');
    }
  });

  test('cancel returns success', async () => {
    const result = await handler.handle('cancel', { conversationId: 'any' });
    expect(result.success).toBe(true);
  });
});

// --- Build Handler ---

describe('BuildHandler', () => {
  let handler: BuildHandler;
  let runner: TaskRunner;

  beforeEach(() => {
    resetTaskRunnerIds();
    runner = new TaskRunner();
    handler = new BuildHandler(runner);
  });

  test('start creates and starts execution', async () => {
    const result = await handler.handle('start', { projectId: 'proj1' });
    expect(result.executionId).toBeDefined();
    const exec = runner.getExecution(result.executionId as string);
    expect(exec!.status).toBe('running');
  });

  test('status returns execution status', async () => {
    const r1 = await handler.handle('start', { projectId: 'proj1' });
    const result = await handler.handle('status', { executionId: r1.executionId });
    expect(result.status).toBe('running');
  });

  test('cancel stops running execution', async () => {
    const r1 = await handler.handle('start', { projectId: 'proj1' });
    const result = await handler.handle('cancel', { executionId: r1.executionId });
    expect(result.success).toBe(true);
    const exec = runner.getExecution(r1.executionId as string);
    expect(exec!.status).toBe('failed');
  });

  test('log returns output', async () => {
    const r1 = await handler.handle('start', { projectId: 'proj1' });
    runner.markCompleted(r1.executionId as string, 0, 'Build output');
    const result = await handler.handle('log', { executionId: r1.executionId });
    expect(result.output).toBe('Build output');
    expect(result.isComplete).toBe(true);
  });

  test('status for unknown execution throws', async () => {
    try {
      await handler.handle('status', { executionId: 'nonexistent' });
      expect(true).toBe(false);
    } catch (e: any) {
      expect(e.message).toContain('not found');
    }
  });
});

// --- Files Handler ---

describe('FilesHandler', () => {
  let handler: FilesHandler;
  let mockFS: MockFS;

  beforeEach(() => {
    mockFS = new MockFS();
    const projectPaths = new Map<string, string>();
    projectPaths.set('proj1', '/workspace');
    handler = new FilesHandler(mockFS, projectPaths);
  });

  test('read returns content and hash', async () => {
    mockFS.files.set('/workspace/src/main.ts', 'const x = 1;');
    const result = await handler.handle('read', { projectId: 'proj1', path: 'src/main.ts' });
    expect(result.content).toBe('const x = 1;');
    expect(result.hash).toBeDefined();
    expect(result.encoding).toBe('utf-8');
  });

  test('write saves content', async () => {
    await handler.handle('write', { projectId: 'proj1', path: 'src/new.ts', content: 'hello' });
    expect(mockFS.files.get('/workspace/src/new.ts')).toBe('hello');
  });

  test('delete removes file', async () => {
    mockFS.files.set('/workspace/src/old.ts', 'content');
    await handler.handle('delete', { projectId: 'proj1', path: 'src/old.ts' });
    expect(mockFS.files.has('/workspace/src/old.ts')).toBe(false);
  });

  test('move renames file', async () => {
    mockFS.files.set('/workspace/src/old.ts', 'content');
    await handler.handle('move', { projectId: 'proj1', oldPath: 'src/old.ts', newPath: 'src/new.ts' });
    expect(mockFS.files.has('/workspace/src/old.ts')).toBe(false);
    expect(mockFS.files.get('/workspace/src/new.ts')).toBe('content');
  });

  test('tree returns entries', async () => {
    const result = await handler.handle('tree', { projectId: 'proj1' });
    expect((result.entries as any[]).length).toBeGreaterThan(0);
  });

  test('patch applies diff', async () => {
    mockFS.files.set('/workspace/src/main.ts', 'old line');
    const diff = [
      'diff --git a/src/main.ts b/src/main.ts',
      '--- a/src/main.ts',
      '+++ b/src/main.ts',
      '@@ -1,1 +1,1 @@',
      '-old line',
      '+new line',
    ].join('\n');
    const result = await handler.handle('patch', { projectId: 'proj1', path: 'src/main.ts', diff });
    expect(result.success).toBe(true);
    expect(mockFS.files.get('/workspace/src/main.ts')).toBe('new line');
  });
});
