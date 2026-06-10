const mod = await import("../dist/mod.js");

if (typeof mod.createBunnyDdnsHandler !== "function") {
  throw new Error("Missing createBunnyDdnsHandler export");
}

if (typeof mod.readBunnyDdnsConfigFromEnv !== "function") {
  throw new Error("Missing readBunnyDdnsConfigFromEnv export");
}

console.log("Package exports smoke test passed.");
