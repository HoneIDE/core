/**
 * Chat history and message management for AI Chat.
 */

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  /** Code blocks extracted from this message */
  codeBlocks: CodeBlock[];
  /** Whether this message is still being streamed */
  isStreaming: boolean;
  /** Internal: accumulated streaming chunks (joined on finalize) */
  _streamParts?: string[];
}

export interface CodeBlock {
  language: string;
  code: string;
  /** Start index in the message content */
  startIndex: number;
}

export interface ChatSession {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: number;
  updatedAt: number;
  /** System prompt for this session */
  systemPrompt: string;
}

let nextMsgId = 1;
let nextSessionId = 1;

function generateMsgId(): string {
  return 'msg_' + (nextMsgId++);
}

function generateSessionId(): string {
  return 'session_' + (nextSessionId++);
}

/** Reset ID counters (for testing). */
export function resetIds(): void {
  nextMsgId = 1;
  nextSessionId = 1;
}

export class ChatModel {
  private sessions: ChatSession[] = [];
  private activeSessionId: string = '';

  /** Create a new chat session. */
  createSession(title?: string, systemPrompt?: string): ChatSession {
    const session: ChatSession = {
      id: generateSessionId(),
      title: title ?? 'New Chat',
      messages: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
      systemPrompt: systemPrompt ?? '',
    };
    this.sessions.push(session);
    if (this.activeSessionId === '') {
      this.activeSessionId = session.id;
    }
    return session;
  }

  /** Get a session by ID. */
  getSession(id: string): ChatSession | null {
    for (let i = 0; i < this.sessions.length; i++) {
      if (this.sessions[i].id === id) return this.sessions[i];
    }
    return null;
  }

  /** Get the active session. */
  getActiveSession(): ChatSession | null {
    return this.getSession(this.activeSessionId);
  }

  /** Set the active session. */
  setActiveSession(id: string): boolean {
    if (this.getSession(id)) {
      this.activeSessionId = id;
      return true;
    }
    return false;
  }

  /** Get all sessions. */
  getAllSessions(): ChatSession[] {
    return this.sessions.slice();
  }

  /** Delete a session. */
  deleteSession(id: string): boolean {
    for (let i = 0; i < this.sessions.length; i++) {
      if (this.sessions[i].id === id) {
        this.sessions.splice(i, 1);
        if (this.activeSessionId === id) {
          this.activeSessionId = this.sessions.length > 0 ? this.sessions[0].id : '';
        }
        return true;
      }
    }
    return false;
  }

  /** Rename a session. */
  renameSession(id: string, title: string): boolean {
    const session = this.getSession(id);
    if (!session) return false;
    session.title = title;
    session.updatedAt = Date.now();
    return true;
  }

  /** Add a user message to the active session. */
  addUserMessage(content: string): ChatMessage | null {
    const session = this.getActiveSession();
    if (!session) return null;

    const msg: ChatMessage = {
      id: generateMsgId(),
      role: 'user',
      content,
      timestamp: Date.now(),
      codeBlocks: extractCodeBlocks(content),
      isStreaming: false,
    };
    session.messages.push(msg);
    session.updatedAt = Date.now();
    return msg;
  }

  /** Start an assistant message (for streaming). */
  startAssistantMessage(): ChatMessage | null {
    const session = this.getActiveSession();
    if (!session) return null;

    const msg: ChatMessage = {
      id: generateMsgId(),
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
      codeBlocks: [],
      isStreaming: true,
    };
    session.messages.push(msg);
    session.updatedAt = Date.now();
    return msg;
  }

  /** Append text to the last assistant message (streaming). */
  appendToLastMessage(text: string): boolean {
    const session = this.getActiveSession();
    if (!session || session.messages.length === 0) return false;

    const last = session.messages[session.messages.length - 1];
    if (last.role !== 'assistant' || !last.isStreaming) return false;

    if (!last._streamParts) {
      last._streamParts = [last.content];
    }
    last._streamParts.push(text);
    last.content = last._streamParts.join('');
    session.updatedAt = Date.now();
    return true;
  }

  /** Finalize the last assistant message (end streaming). */
  finalizeLastMessage(): boolean {
    const session = this.getActiveSession();
    if (!session || session.messages.length === 0) return false;

    const last = session.messages[session.messages.length - 1];
    if (last.role !== 'assistant' || !last.isStreaming) return false;

    if (last._streamParts) {
      last.content = last._streamParts.join('');
      delete last._streamParts;
    }
    last.isStreaming = false;
    last.codeBlocks = extractCodeBlocks(last.content);
    session.updatedAt = Date.now();
    return true;
  }

  /** Get message history formatted for AI API (role + content). */
  getMessagesForAPI(sessionId?: string): { role: string; content: string }[] {
    const session = sessionId ? this.getSession(sessionId) : this.getActiveSession();
    if (!session) return [];

    const result: { role: string; content: string }[] = [];
    if (session.systemPrompt.length > 0) {
      result.push({ role: 'system', content: session.systemPrompt });
    }
    for (let i = 0; i < session.messages.length; i++) {
      const msg = session.messages[i];
      result.push({ role: msg.role, content: msg.content });
    }
    return result;
  }

  /** Get the number of messages in the active session. */
  getMessageCount(): number {
    const session = this.getActiveSession();
    return session ? session.messages.length : 0;
  }

  /** Clear all messages in the active session. */
  clearMessages(): boolean {
    const session = this.getActiveSession();
    if (!session) return false;
    session.messages.length = 0;
    session.updatedAt = Date.now();
    return true;
  }

  /** Session count. */
  get sessionCount(): number {
    return this.sessions.length;
  }
}

/**
 * Extract code blocks from markdown content.
 * Looks for ```lang ... ``` patterns.
 */
export function extractCodeBlocks(content: string): CodeBlock[] {
  const blocks: CodeBlock[] = [];
  let pos = 0;

  while (pos < content.length) {
    const tripleBacktick = content.indexOf('```', pos);
    if (tripleBacktick < 0) break;

    // Find the language (rest of line after ```)
    let langEnd = tripleBacktick + 3;
    while (langEnd < content.length && content.charCodeAt(langEnd) !== 10) {
      langEnd++;
    }
    const language = content.slice(tripleBacktick + 3, langEnd).trim();

    // Find the closing ```
    const codeStart = langEnd + 1;
    const closingBacktick = content.indexOf('```', codeStart);
    if (closingBacktick < 0) break;

    const code = content.slice(codeStart, closingBacktick);
    blocks.push({
      language: language || 'text',
      code,
      startIndex: tripleBacktick,
    });

    pos = closingBacktick + 3;
  }

  return blocks;
}
