// @ts-check
/// <reference path="./bunny-sdk.d.ts" />

import * as BunnySDK from "@bunny.net/edgescript-sdk";
import { createBunnyDdnsHandler, readBunnyDdnsConfigFromEnv } from "./app.js";

const config = readBunnyDdnsConfigFromEnv({
  /** @param {string} name */
  get(name) {
    return Deno.env.get(name);
  },
});

BunnySDK.net.http.serve(createBunnyDdnsHandler({ config }));
