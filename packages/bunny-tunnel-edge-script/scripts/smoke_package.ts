const mod = await import("../dist/mod.js");

if (typeof mod.createBunnyTunnelHandler !== "function") {
  throw new Error("Missing createBunnyTunnelHandler export.");
}

if (typeof mod.readBunnyTunnelConfigFromEnv !== "function") {
  throw new Error("Missing readBunnyTunnelConfigFromEnv export.");
}

console.log("Package exports smoke test passed.");
