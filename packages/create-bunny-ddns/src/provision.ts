#!/usr/bin/env -S deno run --allow-net=api.bunny.net

import { provisionBunnyEdgeScript, validateDdnsSharedSecret } from "./bunny.ts";

const PRIVATE_TERMINAL_ACKNOWLEDGEMENT = "I AM IN A PRIVATE TERMINAL";
const MAX_INPUT_BYTES = 4096;

/** Non-secret configuration embedded in a generated deployment repository. */
export interface PrivateTerminalProvisionOptions {
  /** Bunny Edge Script name. */
  scriptName: string;
  /** Username accepted from the DDNS client. */
  ddnsUsername: string;
  /** Comma-separated hostnames the DDNS client may update. */
  allowedHosts: string;
  /** Comma-separated DNS zones the DDNS client may update. */
  allowedZones: string;
  /** Explicitly grants account-wide DDNS authority when no allow-list is set. */
  allowAllHosts?: boolean;
}

/** Non-secret details returned after successful provisioning. */
export interface PrivateTerminalProvisionResult {
  /** Numeric Bunny Edge Script identifier. */
  scriptId: number;
  /** Bunny-provided script hostname, when the API returns one. */
  hostname: string | null;
}

/** Injectable terminal boundary used by the private provisioning workflow. */
export interface PrivateTerminalIO {
  /** Whether stdin and stdout are attached to an interactive terminal. */
  isTerminal: boolean;
  /** Reads a visible, non-secret acknowledgement. */
  readAcknowledgement(prompt: string): string | null;
  /** Reads one secret without echoing it. */
  readSecret(prompt: string): Promise<string>;
  /** Writes non-secret status text. */
  write(message: string): void;
}

/**
 * Provisions Bunny only after an explicit private-terminal handoff.
 *
 * This function never prints either credential. AI agents must not invoke it
 * because terminal masking does not guarantee isolation from an agent host.
 */
export async function provisionFromPrivateTerminal(
  options: PrivateTerminalProvisionOptions,
  io: PrivateTerminalIO = defaultTerminalIO(),
  fetcher: typeof fetch = fetch,
): Promise<PrivateTerminalProvisionResult> {
  if (!io.isTerminal) {
    throw new Error(
      "Provisioning requires an interactive private terminal. Use the Bunny dashboard when a private terminal is unavailable.",
    );
  }

  io.write(
    "SECURITY HANDOFF\n\n" +
      "Run this command only in a separate local terminal that is not " +
      "controlled, observed, recorded, or shared with an AI agent.\n" +
      "The Bunny account API key has full account access. Both upcoming " +
      "credential prompts are hidden and neither value will be printed.\n\n",
  );
  const acknowledgement = io.readAcknowledgement(
    `Type "${PRIVATE_TERMINAL_ACKNOWLEDGEMENT}" to continue: `,
  );
  if (acknowledgement !== PRIVATE_TERMINAL_ACKNOWLEDGEMENT) {
    throw new Error("Private-terminal acknowledgement was not provided.");
  }

  const apiKey = (await io.readSecret("Bunny account API key: ")).trim();
  if (!apiKey) {
    throw new Error("A Bunny account API key is required.");
  }

  const ddnsSharedSecret = await io.readSecret(
    "DDNS shared secret from your password manager: ",
  );
  validateDdnsSharedSecret(ddnsSharedSecret);
  const confirmation = await io.readSecret("Confirm DDNS shared secret: ");
  if (!timingSafeEqual(ddnsSharedSecret, confirmation)) {
    throw new Error("DDNS shared secret confirmation did not match.");
  }

  io.write("\nCreating and configuring the Bunny Edge Script...\n");
  const result = await provisionBunnyEdgeScript({
    ...options,
    apiKey,
    ddnsSharedSecret,
  }, fetcher);
  io.write(
    "\n--- BEGIN SAFE AI HANDOFF ---\n" +
      "Bunny provisioning: complete\n" +
      `Script ID: ${result.scriptId}\n` +
      `Script hostname: ${result.hostname ?? "not returned"}\n` +
      "Runtime credentials: stored in Bunny (values not shown)\n" +
      "Git integration: pending user dashboard action\n" +
      "--- END SAFE AI HANDOFF ---\n\n" +
      "You may paste only the handoff block above into your AI task. Finish " +
      "the Git integration using README.md, then configure inadyn with the " +
      "DDNS secret from your password manager.\n",
  );
  return result;
}

function timingSafeEqual(left: string, right: string): boolean {
  const encoder = new TextEncoder();
  const leftBytes = encoder.encode(left);
  const rightBytes = encoder.encode(right);
  let difference = leftBytes.length ^ rightBytes.length;
  const length = Math.max(leftBytes.length, rightBytes.length);
  for (let index = 0; index < length; index += 1) {
    difference |= (leftBytes[index] ?? 0) ^ (rightBytes[index] ?? 0);
  }
  return difference === 0;
}

function defaultTerminalIO(): PrivateTerminalIO {
  return {
    isTerminal: Deno.stdin.isTerminal() && Deno.stdout.isTerminal(),
    readAcknowledgement(promptText) {
      return prompt(promptText);
    },
    readSecret: promptSecret,
    write(message) {
      console.log(message);
    },
  };
}

async function promptSecret(label: string): Promise<string> {
  await Deno.stdout.write(new TextEncoder().encode(label));
  Deno.stdin.setRaw(true);
  const bytes: number[] = [];
  const buffer = new Uint8Array(64);
  try {
    while (true) {
      const count = await Deno.stdin.read(buffer);
      if (count === null) break;
      for (const byte of buffer.subarray(0, count)) {
        if (byte === 3) throw new Error("Provisioning cancelled.");
        if (byte === 4 || byte === 10 || byte === 13) {
          return new TextDecoder().decode(new Uint8Array(bytes));
        }
        if (byte === 8 || byte === 127) {
          bytes.pop();
        } else if (byte >= 32) {
          if (bytes.length >= MAX_INPUT_BYTES) {
            throw new Error("Secret input is too long.");
          }
          bytes.push(byte);
        }
      }
    }
    return new TextDecoder().decode(new Uint8Array(bytes));
  } finally {
    buffer.fill(0);
    bytes.fill(0);
    Deno.stdin.setRaw(false);
    await Deno.stdout.write(new Uint8Array([10]));
  }
}
