/**
 * Code actions for AI chat — Explain, Refactor, Fix, Test.
 * Each action produces a formatted prompt for the AI.
 */

export type CodeActionType = 'explain' | 'refactor' | 'fix' | 'test' | 'document' | 'optimize';

export interface CodeActionRequest {
  type: CodeActionType;
  code: string;
  language: string;
  filePath: string;
  /** Optional additional context (e.g. error messages for 'fix') */
  context?: string;
}

export interface CodeActionPrompt {
  /** The user message to send */
  userMessage: string;
  /** Suggested system prompt addition */
  systemAddition: string;
}

/**
 * Build a prompt for a code action.
 */
export function buildCodeActionPrompt(req: CodeActionRequest): CodeActionPrompt {
  const langLabel = req.language || 'code';
  const fileLabel = req.filePath ? ` from \`${req.filePath}\`` : '';

  switch (req.type) {
    case 'explain':
      return {
        userMessage: `Explain the following ${langLabel} code${fileLabel}:\n\n\`\`\`${langLabel}\n${req.code}\n\`\`\``,
        systemAddition: 'Explain code clearly and concisely. Use bullet points for complex logic.',
      };

    case 'refactor':
      return {
        userMessage: `Refactor the following ${langLabel} code${fileLabel} to improve readability and maintainability:\n\n\`\`\`${langLabel}\n${req.code}\n\`\`\``,
        systemAddition: 'Suggest specific refactoring improvements. Show the refactored code.',
      };

    case 'fix': {
      let msg = `Fix the following ${langLabel} code${fileLabel}:\n\n\`\`\`${langLabel}\n${req.code}\n\`\`\``;
      if (req.context) {
        msg += `\n\nError/Issue:\n${req.context}`;
      }
      return {
        userMessage: msg,
        systemAddition: 'Identify the bug and provide the corrected code with a brief explanation.',
      };
    }

    case 'test':
      return {
        userMessage: `Write tests for the following ${langLabel} code${fileLabel}:\n\n\`\`\`${langLabel}\n${req.code}\n\`\`\``,
        systemAddition: 'Write comprehensive unit tests covering edge cases. Use the appropriate test framework for the language.',
      };

    case 'document':
      return {
        userMessage: `Add documentation to the following ${langLabel} code${fileLabel}:\n\n\`\`\`${langLabel}\n${req.code}\n\`\`\``,
        systemAddition: 'Add clear, concise documentation (JSDoc, docstrings, etc.) to the code.',
      };

    case 'optimize':
      return {
        userMessage: `Optimize the following ${langLabel} code${fileLabel} for performance:\n\n\`\`\`${langLabel}\n${req.code}\n\`\`\``,
        systemAddition: 'Identify performance bottlenecks and provide optimized code with explanations.',
      };

    default:
      return {
        userMessage: `Regarding this ${langLabel} code${fileLabel}:\n\n\`\`\`${langLabel}\n${req.code}\n\`\`\``,
        systemAddition: '',
      };
  }
}

/** List of all available code action types. */
export const CODE_ACTION_TYPES: CodeActionType[] = [
  'explain', 'refactor', 'fix', 'test', 'document', 'optimize',
];

/** Get a human-readable label for a code action type. */
export function getCodeActionLabel(type: CodeActionType): string {
  switch (type) {
    case 'explain': return 'Explain';
    case 'refactor': return 'Refactor';
    case 'fix': return 'Fix';
    case 'test': return 'Write Tests';
    case 'document': return 'Document';
    case 'optimize': return 'Optimize';
    default: return 'Action';
  }
}
