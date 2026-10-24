import { createProbeGateway, readConfig } from "./gateway.ts";
import { SUBPROTOCOL } from "../protocol/mod.ts";

if (import.meta.main) {
  const gateway = createProbeGateway(readConfig((name) => Deno.env.get(name)), {
    allowLoopbackHttp: true,
    upgrade: (request) =>
      Deno.upgradeWebSocket(request, { protocol: SUBPROTOCOL }),
    waitUntil: (work) => {
      work.catch(() => {});
    },
  });
  const controller = new AbortController();
  Deno.addSignalListener("SIGINT", () => {
    gateway.dispose();
    controller.abort();
  });
  await Deno.serve({
    hostname: "127.0.0.1",
    port: 8787,
    signal: controller.signal,
  }, gateway.handle).finished;
}
