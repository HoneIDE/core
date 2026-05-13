/**
 * Context builder for agent — assembles the system prompt
 * with workspace info, tools, and conversation history.
 */

export interface WorkspaceInfo {
  rootPath: string;
  name: string;
  language?: string;
  framework?: string;
}

export interface AgentContext {
  systemPrompt: string;
  maxTokens: number;
}

/**
 * Build the system prompt for the agent.
 */
export function buildAgentSystemPrompt(
  workspace: WorkspaceInfo,
  toolNames: string[],
): string {
  const parts: string[] = [];

  parts.push('You are an AI coding agent working in the Hone IDE.');
  parts.push(`Workspace: ${workspace.name} (${workspace.rootPath})`);

  if (workspace.language) {
    parts.push(`Primary language: ${workspace.language}`);
  }
  if (workspace.framework) {
    parts.push(`Framework: ${workspace.framework}`);
  }

  parts.push('');
  parts.push('Available tools: ' + toolNames.join(', '));
  parts.push('');
  parts.push('Instructions:');
  parts.push('- Read files before editing them to understand the context.');
  parts.push('- Make small, focused changes.');
  parts.push('- Verify changes work by running tests or build commands.');
  parts.push('- If a step fails, diagnose the issue before retrying.');
  parts.push('- Ask the user for clarification when requirements are ambiguous.');

  return parts.join('\n');
}

/**
 * Build a concise summary of recent activity for inclusion in follow-up messages.
 */
export function buildActivitySummary(
  entries: { type: string; summary: string }[],
  maxEntries = 10,
): string {
  const recent = entries.length > maxEntries
    ? entries.slice(entries.length - maxEntries)
    : entries;

  if (recent.length === 0) return 'No previous actions.';

  const lines: string[] = ['Recent actions:'];
  for (let i = 0; i < recent.length; i++) {
    lines.push(`- [${recent[i].type}] ${recent[i].summary}`);
  }
  return lines.join('\n');
}
