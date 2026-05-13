/**
 * Tests for Claude Code integration logic.
 *
 * Tests the NDJSON event parsing and state machine behavior
 * that power the Claude Code mode in the AI Chat panel.
 *
 * Since claude-events.ts and claude-state.ts live in hone-ide (Perry-compiled),
 * we re-implement the pure logic here for testing. The actual IDE files import
 * from perry/ui which can't be loaded in bun.
 */

import { describe, test, expect, beforeEach } from 'bun:test';

// ---------------------------------------------------------------------------
// Re-implement extractJsonString (from sse-parser.ts) for testing
// ---------------------------------------------------------------------------

function extractJsonString(json: string, key: string): string {
  const pattern = `"${key}"`;

  let searchStart = 0;
  while (searchStart <= json.length - pattern.length) {
    let pos = -1;
    for (let i = searchStart; i <= json.length - pattern.length; i++) {
      let match = 1;
      for (let j = 0; j < pattern.length; j++) {
        if (json.charCodeAt(i + j) !== pattern.charCodeAt(j)) {
          match = 0;
          break;
        }
      }
      if (match > 0) {
        pos = i;
        break;
      }
    }
    if (pos < 0) return '';

    let afterKey = pos + pattern.length;
    while (afterKey < json.length) {
      const ch = json.charCodeAt(afterKey);
      if (ch === 32 || ch === 9 || ch === 10 || ch === 13) { afterKey += 1; }
      else { break; }
    }
    if (afterKey >= json.length || json.charCodeAt(afterKey) !== 58) {
      searchStart = pos + 1;
      continue;
    }
    afterKey += 1;
    while (afterKey < json.length) {
      const ch = json.charCodeAt(afterKey);
      if (ch === 32 || ch === 9 || ch === 10 || ch === 13) { afterKey += 1; }
      else { break; }
    }
    if (afterKey >= json.length || json.charCodeAt(afterKey) !== 34) {
      searchStart = pos + 1;
      continue;
    }
    afterKey += 1;

    let result = '';
    while (afterKey < json.length) {
      const ch = json.charCodeAt(afterKey);
      if (ch === 92) {
        afterKey += 1;
        if (afterKey < json.length) {
          const next = json.charCodeAt(afterKey);
          if (next === 110) { result += '\n'; }
          else if (next === 116) { result += '\t'; }
          else if (next === 114) { result += '\r'; }
          else if (next === 34) { result += '"'; }
          else if (next === 92) { result += '\\'; }
          else if (next === 117) { afterKey += 4; result += ' '; }
          else { result += json[afterKey]; }
        }
      } else if (ch === 34) {
        break;
      } else {
        result += json[afterKey];
      }
      afterKey += 1;
    }
    return result;
  }
  return '';
}

// ---------------------------------------------------------------------------
// Re-implement NDJSON parsing functions (from claude-events.ts)
// ---------------------------------------------------------------------------

function containsSubstr(str: string, sub: string): number {
  return str.includes(sub) ? 1 : 0;
}

function extractJsonNumber(json: string, key: string): number {
  const pattern = `"${key}"`;
  let pos = -1;
  for (let i = 0; i <= json.length - pattern.length; i++) {
    let match = 1;
    for (let j = 0; j < pattern.length; j++) {
      if (json.charCodeAt(i + j) !== pattern.charCodeAt(j)) { match = 0; break; }
    }
    if (match > 0) { pos = i; break; }
  }
  if (pos < 0) return -1;

  let afterKey = pos + pattern.length;
  while (afterKey < json.length && ' \t\n\r'.includes(json[afterKey])) afterKey++;
  if (afterKey >= json.length || json.charCodeAt(afterKey) !== 58) return -1;
  afterKey++;
  while (afterKey < json.length && ' \t\n\r'.includes(json[afterKey])) afterKey++;

  let numStr = '';
  while (afterKey < json.length) {
    const ch = json.charCodeAt(afterKey);
    if ((ch >= 48 && ch <= 57) || ch === 46 || ch === 45 || ch === 101 || ch === 69 || ch === 43) {
      numStr += json[afterKey];
      afterKey++;
    } else { break; }
  }
  if (numStr.length < 1) return -1;
  return Number(numStr);
}

function parseNDJSONType(line: string): string {
  if (line.length < 10) return '';
  return extractJsonString(line, 'type');
}

function isSystemEvent(evtType: string): number {
  if (evtType.length !== 6) return 0;
  return evtType === 'system' ? 1 : 0;
}

function isAssistantEvent(evtType: string): number {
  if (evtType.length !== 9) return 0;
  return evtType === 'assistant' ? 1 : 0;
}

function isResultEvent(evtType: string): number {
  if (evtType.length !== 6) return 0;
  return evtType === 'result' ? 1 : 0;
}

function parseNDJSONSessionId(line: string): string {
  return extractJsonString(line, 'session_id');
}

function parseNDJSONText(line: string): string {
  if (containsSubstr(line, '"text"') < 1) return '';
  // Find "type":"text" then extract subsequent "text" field
  const typeTextIdx = line.indexOf('"type":"text"');
  if (typeTextIdx < 0) {
    // Try alternate spacing
    const typeTextIdx2 = line.indexOf('"type": "text"');
    if (typeTextIdx2 < 0) return '';
    const remainder = line.slice(typeTextIdx2 + 14);
    return extractJsonString(remainder, 'text');
  }
  const remainder = line.slice(typeTextIdx + 13);
  return extractJsonString(remainder, 'text');
}

function parseNDJSONToolUse(line: string): string {
  if (containsSubstr(line, 'tool_use') < 1) return '';
  return extractJsonString(line, 'name');
}

function parseNDJSONResult(line: string): string {
  return extractJsonString(line, 'result');
}

function parseNDJSONCost(line: string): number {
  return extractJsonNumber(line, 'total_cost_usd');
}

function parseNDJSONTurns(line: string): number {
  return extractJsonNumber(line, 'num_turns');
}

function parseNDJSONModel(line: string): string {
  return extractJsonString(line, 'model');
}

function hasToolUseBlock(line: string): number {
  return containsSubstr(line, 'tool_use');
}

// ---------------------------------------------------------------------------
// Re-implement state machine (from claude-state.ts)
// ---------------------------------------------------------------------------

let claudeStatus = 0;
let claudeSessionUUID = '';
let claudeModelName = '';
let claudeResultText = '';
let claudeResultCost = -1;
let claudeResultTurns = -1;
let claudeAccumulatedText = '';

// Callback tracking
let lastTextDelta = '';
let lastToolName = '';
let lastToolStatus = '';
let lastCompleteResult = '';
let lastCompleteCost = -1;
let lastCompleteTurns = -1;
let lastError = '';
let lastInitSessionId = '';
let lastInitModel = '';

function resetState(): void {
  claudeStatus = 0;
  claudeSessionUUID = '';
  claudeModelName = '';
  claudeResultText = '';
  claudeResultCost = -1;
  claudeResultTurns = -1;
  claudeAccumulatedText = '';
  lastTextDelta = '';
  lastToolName = '';
  lastToolStatus = '';
  lastCompleteResult = '';
  lastCompleteCost = -1;
  lastCompleteTurns = -1;
  lastError = '';
  lastInitSessionId = '';
  lastInitModel = '';
}

function onTextDelta(text: string): void { lastTextDelta = text; }
function onToolActivity(name: string, status: string): void { lastToolName = name; lastToolStatus = status; }
function onComplete(result: string, cost: number, turns: number): void { lastCompleteResult = result; lastCompleteCost = cost; lastCompleteTurns = turns; }
function onError(msg: string): void { lastError = msg; }
function onSessionInit(sessionId: string, model: string): void { lastInitSessionId = sessionId; lastInitModel = model; }

function processClaudeLine(line: string): void {
  if (line.length < 5) return;
  const evtType = parseNDJSONType(line);
  if (evtType.length < 4) return;

  if (isSystemEvent(evtType) > 0) {
    const sid = parseNDJSONSessionId(line);
    if (sid.length > 0) claudeSessionUUID = sid;
    const model = parseNDJSONModel(line);
    if (model.length > 0) claudeModelName = model;
    claudeStatus = 2;
    onSessionInit(claudeSessionUUID, claudeModelName);
    return;
  }

  if (isAssistantEvent(evtType) > 0) {
    if (hasToolUseBlock(line) > 0) {
      const toolName = parseNDJSONToolUse(line);
      if (toolName.length > 0) {
        claudeStatus = 3;
        onToolActivity(toolName, 'running');
      }
    }
    const text = parseNDJSONText(line);
    if (text.length > 0) {
      claudeStatus = 2;
      claudeAccumulatedText += text;
      onTextDelta(text);
    }
    return;
  }

  if (isResultEvent(evtType) > 0) {
    claudeResultText = parseNDJSONResult(line);
    claudeResultCost = parseNDJSONCost(line);
    claudeResultTurns = parseNDJSONTurns(line);
    const sid = parseNDJSONSessionId(line);
    if (sid.length > 0) claudeSessionUUID = sid;
    claudeStatus = 4;
    onComplete(claudeResultText, claudeResultCost, claudeResultTurns);
    return;
  }

  // User event
  if (evtType === 'user') {
    if (claudeStatus === 3) {
      claudeStatus = 2;
      onToolActivity('', 'done');
    }
  }
}

// ===========================================================================
// TESTS
// ===========================================================================

describe('NDJSON Event Parsing', () => {
  test('parseNDJSONType extracts type from system event', () => {
    const line = '{"type":"system","subtype":"init","session_id":"abc-123","model":"claude-sonnet-4-20250514"}';
    expect(parseNDJSONType(line)).toBe('system');
  });

  test('parseNDJSONType extracts type from assistant event', () => {
    const line = '{"type":"assistant","message":{"content":[{"type":"text","text":"Hello world"}]}}';
    expect(parseNDJSONType(line)).toBe('assistant');
  });

  test('parseNDJSONType extracts type from result event', () => {
    const line = '{"type":"result","result":"Done","session_id":"abc","total_cost_usd":0.05,"num_turns":3}';
    expect(parseNDJSONType(line)).toBe('result');
  });

  test('parseNDJSONType extracts type from user event', () => {
    const line = '{"type":"user","message":{"content":[{"type":"tool_result","tool_use_id":"t1"}]}}';
    expect(parseNDJSONType(line)).toBe('user');
  });

  test('parseNDJSONType returns empty for short input', () => {
    expect(parseNDJSONType('short')).toBe('');
  });

  test('isSystemEvent detects system type', () => {
    expect(isSystemEvent('system')).toBe(1);
    expect(isSystemEvent('assistant')).toBe(0);
    expect(isSystemEvent('result')).toBe(0);
    expect(isSystemEvent('sys')).toBe(0);
  });

  test('isAssistantEvent detects assistant type', () => {
    expect(isAssistantEvent('assistant')).toBe(1);
    expect(isAssistantEvent('system')).toBe(0);
    expect(isAssistantEvent('asst')).toBe(0);
  });

  test('isResultEvent detects result type', () => {
    expect(isResultEvent('result')).toBe(1);
    expect(isResultEvent('system')).toBe(0);
    expect(isResultEvent('res')).toBe(0);
  });

  test('parseNDJSONSessionId extracts session_id', () => {
    const line = '{"type":"system","session_id":"sess-uuid-12345","model":"claude-sonnet-4-20250514"}';
    expect(parseNDJSONSessionId(line)).toBe('sess-uuid-12345');
  });

  test('parseNDJSONSessionId returns empty when missing', () => {
    const line = '{"type":"assistant","message":{"content":[]}}';
    expect(parseNDJSONSessionId(line)).toBe('');
  });

  test('parseNDJSONModel extracts model name', () => {
    const line = '{"type":"system","session_id":"abc","model":"claude-sonnet-4-20250514"}';
    expect(parseNDJSONModel(line)).toBe('claude-sonnet-4-20250514');
  });

  test('parseNDJSONText extracts text from assistant message', () => {
    const line = '{"type":"assistant","message":{"content":[{"type":"text","text":"Hello, I can help!"}]}}';
    expect(parseNDJSONText(line)).toBe('Hello, I can help!');
  });

  test('parseNDJSONText returns empty for non-text content', () => {
    const line = '{"type":"assistant","message":{"content":[{"type":"tool_use","name":"Read","input":{}}]}}';
    expect(parseNDJSONText(line)).toBe('');
  });

  test('parseNDJSONText handles escaped characters', () => {
    const line = '{"type":"assistant","message":{"content":[{"type":"text","text":"line1\\nline2\\ttab"}]}}';
    expect(parseNDJSONText(line)).toBe('line1\nline2\ttab');
  });

  test('parseNDJSONToolUse extracts tool name', () => {
    const line = '{"type":"assistant","message":{"content":[{"type":"tool_use","id":"t1","name":"Read","input":{"file_path":"/tmp/test.ts"}}]}}';
    expect(parseNDJSONToolUse(line)).toBe('Read');
  });

  test('parseNDJSONToolUse returns empty for non-tool content', () => {
    const line = '{"type":"assistant","message":{"content":[{"type":"text","text":"hello"}]}}';
    expect(parseNDJSONToolUse(line)).toBe('');
  });

  test('hasToolUseBlock detects tool_use', () => {
    expect(hasToolUseBlock('{"content":[{"type":"tool_use","name":"Edit"}]}')).toBe(1);
    expect(hasToolUseBlock('{"content":[{"type":"text","text":"hi"}]}')).toBe(0);
  });

  test('parseNDJSONResult extracts result text', () => {
    const line = '{"type":"result","result":"Task completed successfully","session_id":"abc","total_cost_usd":0.123}';
    expect(parseNDJSONResult(line)).toBe('Task completed successfully');
  });

  test('parseNDJSONCost extracts cost', () => {
    const line = '{"type":"result","result":"done","total_cost_usd":0.0532,"num_turns":5}';
    expect(parseNDJSONCost(line)).toBeCloseTo(0.0532, 4);
  });

  test('parseNDJSONCost returns -1 when missing', () => {
    const line = '{"type":"result","result":"done"}';
    expect(parseNDJSONCost(line)).toBe(-1);
  });

  test('parseNDJSONTurns extracts turn count', () => {
    const line = '{"type":"result","result":"done","total_cost_usd":0.05,"num_turns":7}';
    expect(parseNDJSONTurns(line)).toBe(7);
  });

  test('parseNDJSONTurns returns -1 when missing', () => {
    const line = '{"type":"result","result":"done","total_cost_usd":0.05}';
    expect(parseNDJSONTurns(line)).toBe(-1);
  });

  test('extractJsonNumber handles zero', () => {
    const line = '{"total_cost_usd":0}';
    expect(extractJsonNumber(line, 'total_cost_usd')).toBe(0);
  });

  test('extractJsonNumber handles scientific notation', () => {
    const line = '{"cost":1.5e-4}';
    expect(extractJsonNumber(line, 'cost')).toBeCloseTo(0.00015, 6);
  });
});

describe('Claude Code State Machine', () => {
  beforeEach(() => {
    resetState();
  });

  test('initial state is IDLE (0)', () => {
    expect(claudeStatus).toBe(0);
  });

  test('system event transitions to STREAMING (2)', () => {
    const line = '{"type":"system","subtype":"init","session_id":"sess-123","model":"claude-sonnet-4-20250514"}';
    processClaudeLine(line);
    expect(claudeStatus).toBe(2);
    expect(claudeSessionUUID).toBe('sess-123');
    expect(claudeModelName).toBe('claude-sonnet-4-20250514');
    expect(lastInitSessionId).toBe('sess-123');
    expect(lastInitModel).toBe('claude-sonnet-4-20250514');
  });

  test('assistant text event stays in STREAMING (2)', () => {
    claudeStatus = 2;
    const line = '{"type":"assistant","message":{"content":[{"type":"text","text":"Hello"}]}}';
    processClaudeLine(line);
    expect(claudeStatus).toBe(2);
    expect(claudeAccumulatedText).toBe('Hello');
    expect(lastTextDelta).toBe('Hello');
  });

  test('text accumulates across multiple assistant events', () => {
    claudeStatus = 2;
    processClaudeLine('{"type":"assistant","message":{"content":[{"type":"text","text":"Hello "}]}}');
    processClaudeLine('{"type":"assistant","message":{"content":[{"type":"text","text":"world!"}]}}');
    expect(claudeAccumulatedText).toBe('Hello world!');
  });

  test('tool_use event transitions to TOOL_RUNNING (3)', () => {
    claudeStatus = 2;
    const line = '{"type":"assistant","message":{"content":[{"type":"tool_use","id":"t1","name":"Read","input":{"file_path":"/test"}}]}}';
    processClaudeLine(line);
    expect(claudeStatus).toBe(3);
    expect(lastToolName).toBe('Read');
    expect(lastToolStatus).toBe('running');
  });

  test('user event after tool transitions back to STREAMING (2)', () => {
    claudeStatus = 3;
    const line = '{"type":"user","message":{"content":[{"type":"tool_result","tool_use_id":"t1"}]}}';
    processClaudeLine(line);
    expect(claudeStatus).toBe(2);
    expect(lastToolStatus).toBe('done');
  });

  test('user event when not in TOOL_RUNNING does nothing', () => {
    claudeStatus = 2;
    const line = '{"type":"user","message":{"content":[{"type":"tool_result","tool_use_id":"t1"}]}}';
    processClaudeLine(line);
    expect(claudeStatus).toBe(2);
  });

  test('result event transitions to COMPLETED (4)', () => {
    claudeStatus = 2;
    const line = '{"type":"result","result":"All done","session_id":"sess-456","total_cost_usd":0.0312,"num_turns":4}';
    processClaudeLine(line);
    expect(claudeStatus).toBe(4);
    expect(claudeResultText).toBe('All done');
    expect(claudeResultCost).toBeCloseTo(0.0312, 4);
    expect(claudeResultTurns).toBe(4);
    expect(claudeSessionUUID).toBe('sess-456');
    expect(lastCompleteResult).toBe('All done');
    expect(lastCompleteCost).toBeCloseTo(0.0312, 4);
    expect(lastCompleteTurns).toBe(4);
  });

  test('full lifecycle: system → text → tool → user → text → result', () => {
    // 1. System init
    processClaudeLine('{"type":"system","subtype":"init","session_id":"sess-lifecycle","model":"claude-sonnet-4-20250514"}');
    expect(claudeStatus).toBe(2);

    // 2. Assistant text
    processClaudeLine('{"type":"assistant","message":{"content":[{"type":"text","text":"Let me read the file."}]}}');
    expect(claudeStatus).toBe(2);
    expect(claudeAccumulatedText).toBe('Let me read the file.');

    // 3. Tool use
    processClaudeLine('{"type":"assistant","message":{"content":[{"type":"tool_use","id":"t1","name":"Read","input":{"file_path":"test.ts"}}]}}');
    expect(claudeStatus).toBe(3);

    // 4. Tool result (user event)
    processClaudeLine('{"type":"user","message":{"content":[{"type":"tool_result","tool_use_id":"t1","content":"file contents"}]}}');
    expect(claudeStatus).toBe(2);

    // 5. More text
    processClaudeLine('{"type":"assistant","message":{"content":[{"type":"text","text":" Here is what I found."}]}}');
    expect(claudeAccumulatedText).toBe('Let me read the file. Here is what I found.');

    // 6. Final result
    processClaudeLine('{"type":"result","result":"Analysis complete","session_id":"sess-lifecycle","total_cost_usd":0.05,"num_turns":2}');
    expect(claudeStatus).toBe(4);
    expect(lastCompleteResult).toBe('Analysis complete');
    expect(claudeSessionUUID).toBe('sess-lifecycle');
  });

  test('short lines are ignored', () => {
    processClaudeLine('');
    processClaudeLine('{');
    processClaudeLine('{"t');
    expect(claudeStatus).toBe(0);
  });

  test('unknown event types are ignored', () => {
    claudeStatus = 2;
    processClaudeLine('{"type":"unknown_event","data":"stuff"}');
    expect(claudeStatus).toBe(2);
  });
});

describe('Session Index Mode Parsing (Mode 3)', () => {
  // Test that mode '3' is correctly parsed alongside existing modes

  function parseMode(modeStr: string): number {
    if (modeStr.length < 1) return 0;
    const c0 = modeStr.charCodeAt(0);
    if (c0 === 48) return 0;       // '0'
    if (c0 === 49) return 1;       // '1'
    if (c0 === 50) return 2;       // '2'
    if (c0 === 51) return 3;       // '3' (Claude Code)
    return 0;
  }

  test('parses mode 0 (Chat)', () => {
    expect(parseMode('0')).toBe(0);
  });

  test('parses mode 1 (Agent)', () => {
    expect(parseMode('1')).toBe(1);
  });

  test('parses mode 2 (Plan)', () => {
    expect(parseMode('2')).toBe(2);
  });

  test('parses mode 3 (Claude Code)', () => {
    expect(parseMode('3')).toBe(3);
  });

  test('empty string defaults to 0', () => {
    expect(parseMode('')).toBe(0);
  });

  test('unknown mode defaults to 0', () => {
    expect(parseMode('9')).toBe(0);
  });
});

describe('Shell Escape', () => {
  function shellEscape(s: string): string {
    let result = "'";
    for (let i = 0; i < s.length; i++) {
      const ch = s.charCodeAt(i);
      if (ch === 39) {
        result += "'\\''";
      } else {
        result += s[i];
      }
    }
    result += "'";
    return result;
  }

  test('wraps simple string in single quotes', () => {
    expect(shellEscape('hello')).toBe("'hello'");
  });

  test('escapes single quotes', () => {
    expect(shellEscape("it's")).toBe("'it'\\''s'");
  });

  test('handles empty string', () => {
    expect(shellEscape('')).toBe("''");
  });

  test('preserves spaces', () => {
    expect(shellEscape('hello world')).toBe("'hello world'");
  });

  test('preserves special characters', () => {
    expect(shellEscape('$(rm -rf /)')).toBe("'$(rm -rf /)'");
  });

  test('preserves backticks', () => {
    expect(shellEscape('`whoami`')).toBe("'`whoami`'");
  });

  test('preserves semicolons and pipes', () => {
    expect(shellEscape('a; rm -rf / | cat')).toBe("'a; rm -rf / | cat'");
  });
});

describe('Sync JSON Escape', () => {
  function jsonEscapeSync(s: string): string {
    let result = '';
    for (let i = 0; i < s.length; i++) {
      const ch = s.charCodeAt(i);
      if (ch === 92) { result += '\\\\'; }
      else if (ch === 34) { result += '\\"'; }
      else if (ch === 10) { result += '\\n'; }
      else if (ch === 13) { result += '\\r'; }
      else if (ch === 9) { result += '\\t'; }
      else { result += s[i]; }
    }
    return result;
  }

  test('escapes backslashes', () => {
    expect(jsonEscapeSync('a\\b')).toBe('a\\\\b');
  });

  test('escapes double quotes', () => {
    expect(jsonEscapeSync('say "hello"')).toBe('say \\"hello\\"');
  });

  test('escapes newlines', () => {
    expect(jsonEscapeSync('line1\nline2')).toBe('line1\\nline2');
  });

  test('escapes tabs', () => {
    expect(jsonEscapeSync('col1\tcol2')).toBe('col1\\tcol2');
  });

  test('escapes carriage returns', () => {
    expect(jsonEscapeSync('line1\r\nline2')).toBe('line1\\r\\nline2');
  });

  test('passes through normal text', () => {
    expect(jsonEscapeSync('hello world 123')).toBe('hello world 123');
  });
});

describe('Real Claude CLI Output Parsing', () => {
  // These are actual NDJSON lines captured from `claude -p "Say exactly: hello" --output-format stream-json --verbose`

  const systemLine = '{"type":"system","subtype":"init","cwd":"/Users/amlug/projects/hone","session_id":"9c2c53f1-8dea-435c-b7e1-c068e70f93d5","tools":["Task","Bash","Read","Edit"],"model":"claude-opus-4-6","permissionMode":"default","claude_code_version":"2.1.72"}';
  const assistantLine = '{"type":"assistant","message":{"model":"claude-opus-4-6","id":"msg_01THfsZz7WjG8hKKFb4u9Y64","type":"message","role":"assistant","content":[{"type":"text","text":"hello"}],"stop_reason":null,"stop_sequence":null,"usage":{"input_tokens":3,"output_tokens":1}},"parent_tool_use_id":null,"session_id":"9c2c53f1-8dea-435c-b7e1-c068e70f93d5"}';
  const resultLine = '{"type":"result","subtype":"success","is_error":false,"duration_ms":1248,"num_turns":1,"result":"hello","session_id":"9c2c53f1-8dea-435c-b7e1-c068e70f93d5","total_cost_usd":0.06082475}';

  test('parses real system event', () => {
    expect(parseNDJSONType(systemLine)).toBe('system');
    expect(isSystemEvent('system')).toBe(1);
    expect(parseNDJSONSessionId(systemLine)).toBe('9c2c53f1-8dea-435c-b7e1-c068e70f93d5');
    expect(parseNDJSONModel(systemLine)).toBe('claude-opus-4-6');
  });

  test('parses real assistant event', () => {
    expect(parseNDJSONType(assistantLine)).toBe('assistant');
    expect(isAssistantEvent('assistant')).toBe(1);
    expect(parseNDJSONText(assistantLine)).toBe('hello');
    expect(parseNDJSONSessionId(assistantLine)).toBe('9c2c53f1-8dea-435c-b7e1-c068e70f93d5');
  });

  test('parses real result event', () => {
    expect(parseNDJSONType(resultLine)).toBe('result');
    expect(isResultEvent('result')).toBe(1);
    expect(parseNDJSONResult(resultLine)).toBe('hello');
    expect(parseNDJSONCost(resultLine)).toBeCloseTo(0.06082475, 4);
    expect(parseNDJSONTurns(resultLine)).toBe(1);
    expect(parseNDJSONSessionId(resultLine)).toBe('9c2c53f1-8dea-435c-b7e1-c068e70f93d5');
  });

  test('full state machine with real output', () => {
    resetState();

    processClaudeLine(systemLine);
    expect(claudeStatus).toBe(2); // STREAMING
    expect(claudeSessionUUID).toBe('9c2c53f1-8dea-435c-b7e1-c068e70f93d5');
    expect(claudeModelName).toBe('claude-opus-4-6');

    processClaudeLine(assistantLine);
    expect(claudeStatus).toBe(2); // still STREAMING
    expect(claudeAccumulatedText).toBe('hello');
    expect(lastTextDelta).toBe('hello');

    processClaudeLine(resultLine);
    expect(claudeStatus).toBe(4); // COMPLETED
    expect(lastCompleteResult).toBe('hello');
    expect(lastCompleteCost).toBeCloseTo(0.06082475, 4);
    expect(lastCompleteTurns).toBe(1);
  });

  test('handles rate_limit_event (unknown type, ignored)', () => {
    resetState();
    claudeStatus = 2;
    const rateLine = '{"type":"rate_limit_event","rate_limit_info":{"status":"allowed_warning"}}';
    processClaudeLine(rateLine);
    expect(claudeStatus).toBe(2); // unchanged
  });
});

describe('Tool Use in Real Format', () => {
  const toolUseLine = '{"type":"assistant","message":{"content":[{"type":"tool_use","id":"toolu_01ABC","name":"Read","input":{"file_path":"/tmp/test.ts"}}]},"session_id":"sess-1"}';
  const toolResultUserLine = '{"type":"user","message":{"content":[{"type":"tool_result","tool_use_id":"toolu_01ABC","content":"file content here"}]},"session_id":"sess-1"}';

  test('detects tool_use in assistant message', () => {
    expect(hasToolUseBlock(toolUseLine)).toBe(1);
    expect(parseNDJSONToolUse(toolUseLine)).toBe('Read');
  });

  test('state machine handles tool cycle', () => {
    resetState();
    claudeStatus = 2; // STREAMING

    processClaudeLine(toolUseLine);
    expect(claudeStatus).toBe(3); // TOOL_RUNNING
    expect(lastToolName).toBe('Read');
    expect(lastToolStatus).toBe('running');

    processClaudeLine(toolResultUserLine);
    expect(claudeStatus).toBe(2); // back to STREAMING
    expect(lastToolStatus).toBe('done');
  });
});

describe('Sync Field Extraction', () => {
  function extractSyncField(json: string, key: string): string {
    const pattern = `"${key}"`;
    let pos = -1;
    for (let i = 0; i <= json.length - pattern.length; i++) {
      let match = 1;
      for (let j = 0; j < pattern.length; j++) {
        if (json.charCodeAt(i + j) !== pattern.charCodeAt(j)) { match = 0; break; }
      }
      if (match > 0) { pos = i; break; }
    }
    if (pos < 0) return '';

    let afterKey = pos + pattern.length;
    while (afterKey < json.length && (json.charCodeAt(afterKey) === 32 || json.charCodeAt(afterKey) === 9)) afterKey++;
    if (afterKey >= json.length || json.charCodeAt(afterKey) !== 58) return '';
    afterKey++;
    while (afterKey < json.length && (json.charCodeAt(afterKey) === 32 || json.charCodeAt(afterKey) === 9)) afterKey++;
    if (afterKey >= json.length || json.charCodeAt(afterKey) !== 34) return '';
    afterKey++;

    let result = '';
    while (afterKey < json.length) {
      const ch = json.charCodeAt(afterKey);
      if (ch === 92) {
        afterKey++;
        if (afterKey < json.length) {
          const next = json.charCodeAt(afterKey);
          if (next === 110) { result += '\n'; }
          else if (next === 116) { result += '\t'; }
          else if (next === 34) { result += '"'; }
          else if (next === 92) { result += '\\'; }
          else { result += json[afterKey]; }
        }
      } else if (ch === 34) { break; }
      else { result += json[afterKey]; }
      afterKey++;
    }
    return result;
  }

  test('extracts simple string field', () => {
    expect(extractSyncField('{"sessionId":"abc-123"}', 'sessionId')).toBe('abc-123');
  });

  test('extracts field with spaces in JSON', () => {
    expect(extractSyncField('{"sessionId" : "abc-123"}', 'sessionId')).toBe('abc-123');
  });

  test('extracts field with escaped characters', () => {
    expect(extractSyncField('{"delta":"line1\\nline2"}', 'delta')).toBe('line1\nline2');
  });

  test('returns empty for missing field', () => {
    expect(extractSyncField('{"other":"value"}', 'sessionId')).toBe('');
  });

  test('extracts from multi-field JSON', () => {
    const json = '{"sessionId":"s1","delta":"hello","deltaType":"text"}';
    expect(extractSyncField(json, 'sessionId')).toBe('s1');
    expect(extractSyncField(json, 'delta')).toBe('hello');
    expect(extractSyncField(json, 'deltaType')).toBe('text');
  });

  test('handles empty string value', () => {
    expect(extractSyncField('{"toolName":""}', 'toolName')).toBe('');
  });
});
