/** The full configuration (machine plus evolution parameters) encodes into
 * the URL hash, deflate-compressed and base64url-encoded, so every figure has
 * a link that reproduces it exactly. */

import type { AppState } from "./types.js";

async function pipe(bytes: Uint8Array, stream: ReadableWritablePair<Uint8Array, Uint8Array>) {
  const blob = new Blob([bytes as BlobPart]);
  const compressed = blob.stream().pipeThrough(stream);
  return new Uint8Array(await new Response(compressed).arrayBuffer());
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

function fromBase64Url(text: string): Uint8Array {
  const padded = text.replaceAll("-", "+").replaceAll("_", "/");
  const binary = atob(padded + "=".repeat((4 - (padded.length % 4)) % 4));
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

export async function encodeState(state: AppState): Promise<string> {
  const raw = new TextEncoder().encode(JSON.stringify(state));
  const packed = await pipe(raw, new CompressionStream("deflate-raw"));
  return toBase64Url(packed);
}

export async function decodeState(hash: string): Promise<AppState | null> {
  const text = hash.replace(/^#/, "");
  if (!text) return null;
  try {
    const packed = fromBase64Url(text);
    const raw = await pipe(packed, new DecompressionStream("deflate-raw"));
    return JSON.parse(new TextDecoder().decode(raw)) as AppState;
  } catch {
    return null;
  }
}

/** Put the state in the address bar. A preset that has not been changed
 * gets a short link by name (`#fibonacci`); anything else carries the whole
 * machine, compressed, so the link reproduces it exactly. */
export async function writeStateToUrl(state: AppState, shortName: string | null): Promise<void> {
  const fragment = shortName ?? (await encodeState(state));
  history.replaceState(null, "", "#" + fragment);
}

/** The hash as a preset name, if it looks like one. */
export function presetNameFromHash(hash: string): string | null {
  const text = hash.replace(/^#/, "");
  return /^[a-z][a-z0-9_]{0,40}$/.test(text) ? text : null;
}
