// cspell:ignore rendezvous
export const SUBPROTOCOL = "bunny-rendezvous-v1";
export const FRAME_BYTES = 68;
export const CONTROL_BYTES = 512;
export const MAX_BUFFERED_BYTES = 4096;
export const HEARTBEAT_MS = 10_000;
export const IDLE_MS = 30_000;
export const LIFETIME_MS = 300_000;

export interface Registration {
  type: "registered";
  version: 1;
  isolateId: string;
  sessionId: string;
  hostname: string;
}

const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: true });

export function exactHostname(value: string): string {
  if (
    value.length > 253 || value !== value.toLowerCase() ||
    !value.includes(".") ||
    value.split(".").some((label) =>
      label.length > 63 || !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label)
    )
  ) throw new Error("An exact lower-case DNS hostname is required.");
  return value;
}

export function validateToken(value: string): string {
  if (!/^[A-Za-z0-9_-]{32,256}$/.test(value)) {
    throw new Error("Probe tokens must contain 32-256 URL-safe characters.");
  }
  return value;
}

export function challenge(requestId: string): Uint8Array<ArrayBuffer> {
  if (!uuid.test(requestId)) throw new Error("Invalid request ID.");
  const frame = new Uint8Array(FRAME_BYTES);
  frame.set(encoder.encode(requestId));
  crypto.getRandomValues(frame.subarray(36));
  return frame;
}

export function decodeFrame(value: unknown): { id: string; bytes: Uint8Array } {
  if (!(value instanceof ArrayBuffer) || value.byteLength !== FRAME_BYTES) {
    throw new Error("Invalid binary probe frame.");
  }
  const bytes = new Uint8Array(value);
  const id = decoder.decode(bytes.subarray(0, 36));
  if (!uuid.test(id)) throw new Error("Invalid request ID.");
  return { id, bytes };
}

export function parseControl(value: unknown): Record<string, unknown> {
  if (
    typeof value !== "string" || value.length > CONTROL_BYTES ||
    encoder.encode(value).byteLength > CONTROL_BYTES
  ) {
    throw new Error("Invalid control message.");
  }
  const parsed = JSON.parse(value);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Invalid control message.");
  }
  return parsed;
}

export function registration(value: unknown): Registration {
  const parsed = parseControl(value);
  if (
    parsed.type !== "registered" || parsed.version !== 1 ||
    typeof parsed.isolateId !== "string" || !uuid.test(parsed.isolateId) ||
    typeof parsed.sessionId !== "string" || !uuid.test(parsed.sessionId) ||
    typeof parsed.hostname !== "string"
  ) throw new Error("Invalid registration.");
  exactHostname(parsed.hostname);
  return parsed as unknown as Registration;
}

export function equalBytes(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index++) {
    difference |= left[index] ^ right[index];
  }
  return difference === 0;
}

export function canSend(socket: WebSocket): boolean {
  return socket.readyState === WebSocket.OPEN &&
    socket.bufferedAmount <= MAX_BUFFERED_BYTES - FRAME_BYTES;
}
