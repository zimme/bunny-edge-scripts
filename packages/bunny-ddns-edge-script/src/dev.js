// @ts-check

import { createBunnyDdnsHandler, readBunnyDdnsConfigFromEnv } from "./app.js";

const config = readBunnyDdnsConfigFromEnv({
  /** @param {string} name */
  get(name) {
    return Deno.env.get(name);
  },
});

const port = Number(Deno.env.get("PORT") ?? "8080");

Deno.serve({ port }, createBunnyDdnsHandler({ config }));
