import { createProbeGateway, readConfig } from "./gateway.ts";
import { SUBPROTOCOL } from "../protocol/mod.ts";

// Inject the Bunny SDK serve function at deployment; this file never deploys.
interface BunnyRequest extends Request {
  upgradeWebSocket(
    options: { protocol: string },
  ): { socket: WebSocket; response: Response };
}

export function bunnyProbeHandler(waitUntil: (work: Promise<unknown>) => void) {
  return createProbeGateway(readConfig((name) => Deno.env.get(name)), {
    upgrade: (request) =>
      (request as BunnyRequest).upgradeWebSocket({ protocol: SUBPROTOCOL }),
    waitUntil,
  }).handle;
}
