/**
 * Tool definitions for the AI agent.
 * Each tool has a name, description, parameters schema, and a type tag
 * indicating what kind of approval it needs.
 */

export type ToolApprovalLevel = 'none' | 'notify' | 'confirm';

export interface AgentToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  /** What approval the user must give before this tool runs */
  approvalLevel: ToolApprovalLevel;
}

/**
 * All agent tool definitions.
 */
export const AGENT_TOOLS: AgentToolDefinition[] = [
  {
    name: 'file_read',
    description: 'Read the contents of a file at a given path.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Absolute or workspace-relative path' },
      },
      required: ['path'],
    },
    approvalLevel: 'none',
  },
  {
    name: 'file_edit',
    description: 'Edit a file by replacing a specific string with new content.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'File path' },
        old_text: { type: 'string', description: 'Text to find and replace' },
        new_text: { type: 'string', description: 'Replacement text' },
      },
      required: ['path', 'old_text', 'new_text'],
    },
    approvalLevel: 'confirm',
  },
  {
    name: 'file_create',
    description: 'Create a new file with given content.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'File path to create' },
        content: { type: 'string', description: 'File content' },
      },
      required: ['path', 'content'],
    },
    approvalLevel: 'confirm',
  },
  {
    name: 'file_delete',
    description: 'Delete a file.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'File path to delete' },
      },
      required: ['path'],
    },
    approvalLevel: 'confirm',
  },
  {
    name: 'file_rename',
    description: 'Rename or move a file.',
    parameters: {
      type: 'object',
      properties: {
        old_path: { type: 'string', description: 'Current file path' },
        new_path: { type: 'string', description: 'New file path' },
      },
      required: ['old_path', 'new_path'],
    },
    approvalLevel: 'confirm',
  },
  {
    name: 'terminal_run',
    description: 'Run a shell command and return its output.',
    parameters: {
      type: 'object',
      properties: {
        command: { type: 'string', description: 'Shell command to execute' },
        cwd: { type: 'string', description: 'Working directory (optional)' },
      },
      required: ['command'],
    },
    approvalLevel: 'confirm',
  },
  {
    name: 'terminal_read',
    description: 'Read the current output of a running terminal.',
    parameters: {
      type: 'object',
      properties: {
        terminal_id: { type: 'string', description: 'Terminal instance ID' },
      },
      required: ['terminal_id'],
    },
    approvalLevel: 'none',
  },
  {
    name: 'search',
    description: 'Search for text across files in the workspace.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search text or regex' },
        path: { type: 'string', description: 'Directory to search in (optional, defaults to workspace root)' },
        regex: { type: 'boolean', description: 'Whether query is a regex' },
        case_sensitive: { type: 'boolean', description: 'Case sensitive search' },
      },
      required: ['query'],
    },
    approvalLevel: 'none',
  },
  {
    name: 'git_status',
    description: 'Get the current git status (branch, changed files).',
    parameters: { type: 'object', properties: {} },
    approvalLevel: 'none',
  },
  {
    name: 'git_diff',
    description: 'Get the git diff of working changes or staged changes.',
    parameters: {
      type: 'object',
      properties: {
        staged: { type: 'boolean', description: 'Show staged changes instead of working changes' },
        path: { type: 'string', description: 'Specific file path to diff' },
      },
    },
    approvalLevel: 'none',
  },
  {
    name: 'git_commit',
    description: 'Stage files and create a git commit.',
    parameters: {
      type: 'object',
      properties: {
        message: { type: 'string', description: 'Commit message' },
        files: { type: 'array', items: { type: 'string' }, description: 'Files to stage (optional, all if omitted)' },
      },
      required: ['message'],
    },
    approvalLevel: 'confirm',
  },
  {
    name: 'lsp_diagnostics',
    description: 'Get diagnostics (errors/warnings) for a file from the language server.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'File path' },
      },
      required: ['path'],
    },
    approvalLevel: 'none',
  },
  {
    name: 'web_fetch',
    description: 'Fetch content from a URL.',
    parameters: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'URL to fetch' },
      },
      required: ['url'],
    },
    approvalLevel: 'notify',
  },
  {
    name: 'user_ask',
    description: 'Ask the user a question and wait for their response.',
    parameters: {
      type: 'object',
      properties: {
        question: { type: 'string', description: 'Question to ask' },
      },
      required: ['question'],
    },
    approvalLevel: 'none',
  },
  {
    name: 'user_show_diff',
    description: 'Show the user a diff and ask for approval.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'File path' },
        old_content: { type: 'string', description: 'Original content' },
        new_content: { type: 'string', description: 'Proposed new content' },
      },
      required: ['path', 'old_content', 'new_content'],
    },
    approvalLevel: 'none',
  },
];

/** Get a tool definition by name. */
export function getToolByName(name: string): AgentToolDefinition | null {
  for (let i = 0; i < AGENT_TOOLS.length; i++) {
    if (AGENT_TOOLS[i].name === name) return AGENT_TOOLS[i];
  }
  return null;
}

/** Get tool definitions formatted for the AI API. */
export function getToolsForAPI(): { name: string; description: string; parameters: Record<string, unknown> }[] {
  const result: { name: string; description: string; parameters: Record<string, unknown> }[] = [];
  for (let i = 0; i < AGENT_TOOLS.length; i++) {
    result.push({
      name: AGENT_TOOLS[i].name,
      description: AGENT_TOOLS[i].description,
      parameters: AGENT_TOOLS[i].parameters,
    });
  }
  return result;
}
