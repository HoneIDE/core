/**
 * AI domain handler — wraps ChatModel for conversation management.
 */

import type { DomainHandler } from '../sdk-handler';
import type { ChatModel, ChatSession } from '../../ai/chat/chat-model';

export class AiHandler implements DomainHandler {
  readonly domain = 'ai';
  private chatModel: ChatModel;

  constructor(chatModel: ChatModel) {
    this.chatModel = chatModel;
  }

  async handle(operation: string, payload: Record<string, unknown>): Promise<Record<string, unknown>> {
    switch (operation) {
      case 'conversations':
        return this.conversations();
      case 'history':
        return this.history(payload);
      case 'send':
        return this.send(payload);
      case 'cancel':
        return { success: true }; // Cancellation is a no-op without streaming state
      default:
        throw new Error(`Unknown operation: ai.${operation}`);
    }
  }

  getSubscribableEvents(): string[] {
    return ['onMessage', 'onStream', 'onAction'];
  }

  private conversations(): Record<string, unknown> {
    const sessions = this.chatModel.getAllSessions();
    const conversations = sessions.map((s: ChatSession) => ({
      id: s.id,
      title: s.title,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
      messageCount: s.messages.length,
    }));
    return { conversations };
  }

  private history(payload: Record<string, unknown>): Record<string, unknown> {
    const conversationId = payload.conversationId as string;
    const limit = (payload.limit as number) || 100;
    const offset = (payload.offset as number) || 0;

    const session = this.chatModel.getSession(conversationId);
    if (!session) {
      throw new Error(`Conversation not found: ${conversationId}`);
    }

    const messages = session.messages.slice(offset, offset + limit).map(m => ({
      id: m.id,
      role: m.role,
      content: m.content,
      timestamp: m.timestamp,
      isStreaming: m.isStreaming,
    }));

    return { messages, total: session.messages.length };
  }

  private send(payload: Record<string, unknown>): Record<string, unknown> {
    const conversationId = payload.conversationId as string | undefined;
    const message = payload.message as string;

    let sessionId = conversationId;
    if (!sessionId) {
      const session = this.chatModel.createSession();
      sessionId = session.id;
    }

    this.chatModel.setActiveSession(sessionId);
    const msg = this.chatModel.addUserMessage(message);
    if (!msg) {
      throw new Error('Failed to add message');
    }

    return { conversationId: sessionId, messageId: msg.id };
  }
}
