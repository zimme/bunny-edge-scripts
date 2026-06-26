/// <reference path="./bunny-sdk.d.ts" />

import * as BunnySDK from "@bunny.net/edgescript-sdk";
import {
  createBunnyTunnelHandler,
  readBunnyTunnelConfigFromEnv,
} from "./mod.ts";

const config = readBunnyTunnelConfigFromEnv({
  get(name: string) {
    return Deno.env.get(name);
  },
});

BunnySDK.net.http.serve(createBunnyTunnelHandler({ config }));
