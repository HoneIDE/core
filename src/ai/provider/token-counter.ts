/**
 * Token counter — estimates token counts for context management.
 *
 * Uses a simple character-based heuristic (1 token ≈ 4 chars for English).
 * This is intentionally approximate — exact counting requires provider-specific tokenizers.
 */

/** Estimate token count from text using the ~4 chars/token heuristic. */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/** Estimate tokens for an array of messages. */
export function estimateMessageTokens(messages: { role: string; content: string }[]): number {
  let total = 0;
  for (const msg of messages) {
    // ~4 tokens overhead per message for role/formatting
    total += 4 + estimateTokens(msg.content);
  }
  return total;
}

/** Check if messages fit within a context window. */
export function fitsInContext(
  messages: { role: string; content: string }[],
  contextWindow: number,
  reserveForCompletion: number = 4096,
): boolean {
  const used = estimateMessageTokens(messages);
  return used + reserveForCompletion <= contextWindow;
}

/** Truncate messages from the beginning to fit within context. */
export function truncateToFit(
  messages: { role: string; content: string }[],
  contextWindow: number,
  reserveForCompletion: number = 4096,
): { role: string; content: string }[] {
  const budget = contextWindow - reserveForCompletion;
  if (budget <= 0) return [];

  // Always keep the first message (usually system prompt) and last message
  if (messages.length <= 2) return messages;

  // Try removing messages from the middle/beginning
  const result: { role: string; content: string }[] = [messages[0]];
  let used = 4 + estimateTokens(messages[0].content);

  // Add messages from the end until we run out of budget
  const tail: { role: string; content: string }[] = [];
  for (let i = messages.length - 1; i >= 1; i--) {
    const msgTokens = 4 + estimateTokens(messages[i].content);
    if (used + msgTokens <= budget) {
      tail.push(messages[i]);
      used += msgTokens;
    } else {
      break;
    }
  }

  tail.reverse();
  return [...result, ...tail];
}
