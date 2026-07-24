/// <reference path="./bunny-sdk.d.ts" />

import * as BunnySDK from "@bunny.net/edgescript-sdk";
import {
  createBunnyDdnsHandler,
  readBunnyDdnsConfigFromEnv,
} from "@zimme/bunny-ddns-edge-script";

const config = readBunnyDdnsConfigFromEnv({
  get(name: string) {
    return Deno.env.get(name);
  },
});

BunnySDK.net.http.serve(createBunnyDdnsHandler({ config }));
