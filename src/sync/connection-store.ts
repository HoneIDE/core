/**
 * Connection store — persists paired device info to disk.
 *
 * Stores relay URL, room ID, device token, and device name
 * so guest devices can auto-reconnect without re-pairing.
 *
 * Format: simple key=value (same as settings.ini — Perry-safe).
 */

export interface StoredConnection {
  relayUrl: string;
  roomId: string;
  deviceToken: string;
  hostDeviceId: string;
  hostName: string;
  deviceId: string;
  deviceName: string;
  pairedAt: number;
}

/** Serialize a StoredConnection to key=value text. */
export function serializeConnection(conn: StoredConnection): string {
  let out = '';
  out += 'relayUrl=';
  out += conn.relayUrl;
  out += '\n';
  out += 'roomId=';
  out += conn.roomId;
  out += '\n';
  out += 'deviceToken=';
  out += conn.deviceToken;
  out += '\n';
  out += 'hostDeviceId=';
  out += conn.hostDeviceId;
  out += '\n';
  out += 'hostName=';
  out += conn.hostName;
  out += '\n';
  out += 'deviceId=';
  out += conn.deviceId;
  out += '\n';
  out += 'deviceName=';
  out += conn.deviceName;
  out += '\n';
  out += 'pairedAt=';
  out += String(conn.pairedAt);
  out += '\n';
  return out;
}

/** Parse key=value text back into a StoredConnection. Returns null if incomplete. */
export function parseConnection(text: string): StoredConnection | null {
  let relayUrl = '';
  let roomId = '';
  let deviceToken = '';
  let hostDeviceId = '';
  let hostName = '';
  let deviceId = '';
  let deviceName = '';
  let pairedAt = 0;

  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.length < 3) continue;
    let eqIdx = -1;
    for (let j = 0; j < line.length; j++) {
      if (line.charCodeAt(j) === 61) { eqIdx = j; break; }
    }
    if (eqIdx < 1) continue;
    const key = line.slice(0, eqIdx);
    const val = line.slice(eqIdx + 1);
    if (key === 'relayUrl') relayUrl = val;
    if (key === 'roomId') roomId = val;
    if (key === 'deviceToken') deviceToken = val;
    if (key === 'hostDeviceId') hostDeviceId = val;
    if (key === 'hostName') hostName = val;
    if (key === 'deviceId') deviceId = val;
    if (key === 'deviceName') deviceName = val;
    if (key === 'pairedAt') pairedAt = parseInt(val) || 0;
  }

  if (relayUrl.length === 0 || roomId.length === 0 || deviceToken.length === 0) {
    return null;
  }

  return { relayUrl, roomId, deviceToken, hostDeviceId, hostName, deviceId, deviceName, pairedAt };
}

/** Serialize multiple connections (one per section, separated by blank line). */
export function serializeConnections(conns: StoredConnection[]): string {
  let out = '';
  for (let i = 0; i < conns.length; i++) {
    if (i > 0) out += '\n';
    out += '[connection]\n';
    out += serializeConnection(conns[i]);
  }
  return out;
}

/** Parse multiple connections from sections. */
export function parseConnections(text: string): StoredConnection[] {
  const results: StoredConnection[] = [];
  const sections = text.split('[connection]');
  for (let i = 0; i < sections.length; i++) {
    const section = sections[i];
    if (section.length < 10) continue;
    const conn = parseConnection(section);
    if (conn) results.push(conn);
  }
  return results;
}
