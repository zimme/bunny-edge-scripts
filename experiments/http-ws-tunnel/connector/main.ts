import { runConnector } from "./client.ts";

export function parseArgs(
  args: string[],
): { url: string; allowLoopbackHttp: boolean } {
  const [url, mode] = args;
  if (
    !url || args.length > 2 || (mode !== undefined && mode !== "--loopback")
  ) {
    throw new Error("Usage: connector <wss-endpoint> [--loopback]");
  }
  return { url, allowLoopbackHttp: mode === "--loopback" };
}

if (import.meta.main) {
  const options = parseArgs(Deno.args);
  const controller = new AbortController();
  Deno.addSignalListener("SIGINT", () => controller.abort());
  await runConnector({
    ...options,
    token: Deno.env.get("TUNNEL_PROBE_CONNECTOR_TOKEN") ?? "",
    signal: controller.signal,
    onRegistered: (registration) => console.log(JSON.stringify(registration)),
  });
}
