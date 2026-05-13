/**
 * Git blame parser — parses `git blame --porcelain` output.
 */
export interface BlameEntry {
  commit: string;
  lineNumber: number;
  originalLine: number;
  numLines: number;
  author: string;
  authorMail: string;
  authorTime: number;
  authorTz: string;
  committer: string;
  committerMail: string;
  committerTime: number;
  committerTz: string;
  summary: string;
  filename: string;
  content: string;
}

export function parseBlameOutput(raw: string): BlameEntry[] {
  // Parse git blame --porcelain format
  // Format:
  // <sha> <orig-line> <final-line> <num-lines>
  // author <name>
  // author-mail <email>
  // author-time <timestamp>
  // author-tz <tz>
  // committer <name>
  // committer-mail <email>
  // committer-time <timestamp>
  // committer-tz <tz>
  // summary <text>
  // filename <path>
  // \t<content>
  const lines = raw.split('\n');
  const entries: BlameEntry[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    if (!line || line.length === 0) { i++; continue; }

    // Header line: sha orig-line final-line [num-lines]
    const headerMatch = line.match(/^([0-9a-f]{40})\s+(\d+)\s+(\d+)(?:\s+(\d+))?$/);
    if (!headerMatch) { i++; continue; }

    const entry: BlameEntry = {
      commit: headerMatch[1],
      originalLine: parseInt(headerMatch[2], 10),
      lineNumber: parseInt(headerMatch[3], 10),
      numLines: headerMatch[4] ? parseInt(headerMatch[4], 10) : 1,
      author: '',
      authorMail: '',
      authorTime: 0,
      authorTz: '',
      committer: '',
      committerMail: '',
      committerTime: 0,
      committerTz: '',
      summary: '',
      filename: '',
      content: '',
    };

    i++;
    // Parse key-value lines until content line (starts with \t)
    while (i < lines.length) {
      const kv = lines[i];
      if (kv.startsWith('\t')) {
        entry.content = kv.slice(1);
        i++;
        break;
      }
      if (kv.startsWith('author ')) entry.author = kv.slice(7);
      else if (kv.startsWith('author-mail ')) entry.authorMail = kv.slice(12);
      else if (kv.startsWith('author-time ')) entry.authorTime = parseInt(kv.slice(12), 10);
      else if (kv.startsWith('author-tz ')) entry.authorTz = kv.slice(10);
      else if (kv.startsWith('committer ')) entry.committer = kv.slice(10);
      else if (kv.startsWith('committer-mail ')) entry.committerMail = kv.slice(15);
      else if (kv.startsWith('committer-time ')) entry.committerTime = parseInt(kv.slice(15), 10);
      else if (kv.startsWith('committer-tz ')) entry.committerTz = kv.slice(13);
      else if (kv.startsWith('summary ')) entry.summary = kv.slice(8);
      else if (kv.startsWith('filename ')) entry.filename = kv.slice(9);
      i++;
    }

    entries.push(entry);
  }

  return entries;
}
