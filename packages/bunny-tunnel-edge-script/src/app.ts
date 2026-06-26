export interface EnvReader {
  get(name: string): string | undefined;
}

export type Fetcher = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

export interface TunnelRoute {
  origin: string;
  host?: string;
  pathPrefix?: string;
}

export interface RuntimeConfig {
  routes: TunnelRoute[];
  viewerTokens: string[];
  originSharedSecret?: string;
  allowedMethods: string[];
  deniedPathPrefixes: string[];
  allowInsecureHttp: boolean;
  healthPath: string;
  preserveHostHeader: boolean;
  requestTimeoutMs: number;
}

export interface HandlerOptions {
  config: RuntimeConfig;
  fetcher?: Fetcher;
  now?: () => Date;
}

interface SelectedRoute {
  route: NormalizedRoute;
  targetUrl: URL;
}

interface NormalizedRoute {
  origin: URL;
  host?: string;
  pathPrefix: string;
}

type NormalizedConfig = Omit<RuntimeConfig, "routes"> & {
  routes: NormalizedRoute[];
};

const HOP_BY_HOP_HEADERS = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
]);

const DEFAULT_ALLOWED_METHODS = [
  "GET",
  "HEAD",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "OPTIONS",
];

const DEFAULT_HEALTH_PATH = "/__bunny_tunnel/healthz";
const SIGNATURE_VERSION = "v1";

export function readBunnyTunnelConfigFromEnv(env: EnvReader): RuntimeConfig {
  const routes = readRoutes(env);

  if (routes.length === 0) {
    throw new Error("Missing required TUNNEL_ORIGIN or TUNNEL_ROUTES secret.");
  }

  const healthPath = normalizePath(
    env.get("TUNNEL_HEALTH_PATH") ?? DEFAULT_HEALTH_PATH,
  );

  return {
    routes,
    viewerTokens: splitList(
      env.get("TUNNEL_VIEWER_TOKENS") ?? env.get("TUNNEL_VIEWER_TOKEN"),
    ),
    originSharedSecret: optionalString(env.get("TUNNEL_ORIGIN_SHARED_SECRET")),
    allowedMethods:
      splitList(env.get("TUNNEL_ALLOWED_METHODS")).map((method) =>
        method.toUpperCase()
      ).filter(Boolean) || DEFAULT_ALLOWED_METHODS,
    deniedPathPrefixes: splitList(env.get("TUNNEL_DENIED_PATH_PREFIXES"))
      .map(normalizePath),
    allowInsecureHttp: readBoolean(env.get("TUNNEL_ALLOW_INSECURE_HTTP")),
    healthPath,
    preserveHostHeader: readBoolean(env.get("TUNNEL_PRESERVE_HOST_HEADER")),
    requestTimeoutMs: readInteger(env.get("TUNNEL_REQUEST_TIMEOUT_MS"), 30000),
  };
}

export function createBunnyTunnelHandler(
  options: HandlerOptions,
): (request: Request) => Promise<Response> {
  const fetcher = options.fetcher ?? fetch;
  const now = options.now ?? (() => new Date());
  const config = normalizeConfig(options.config);

  return async function handleTunnelRequest(
    request: Request,
  ): Promise<Response> {
    try {
      return await handleRequest(request, config, fetcher, now);
    } catch (error) {
      console.error(
        "[bunny-tunnel-edge-script] unhandled request failure",
        error,
      );
      return textResponse("bad gateway\n", 502);
    }
  };
}

async function handleRequest(
  request: Request,
  config: NormalizedConfig,
  fetcher: Fetcher,
  now: () => Date,
): Promise<Response> {
  const requestUrl = new URL(request.url);

  if (requestUrl.pathname === config.healthPath) {
    return jsonResponse({ ok: true, service: "bunny-tunnel-edge-script" });
  }

  if (!config.allowInsecureHttp && !isHttpsRequest(request)) {
    return textResponse("HTTPS required\n", 400);
  }

  if (!config.allowedMethods.includes(request.method.toUpperCase())) {
    return textResponse("method not allowed\n", 405, {
      allow: config.allowedMethods.join(", "),
    });
  }

  if (isDeniedPath(requestUrl.pathname, config.deniedPathPrefixes)) {
    return textResponse("not found\n", 404);
  }

  if (!isViewerAuthorized(request, config.viewerTokens)) {
    return textResponse("unauthorized\n", 401, {
      "www-authenticate": 'Bearer realm="@zimme/bunny-tunnel-edge-script"',
    });
  }

  const selected = selectRoute(requestUrl, config.routes);
  if (!selected) {
    return textResponse("no route\n", 404);
  }

  const body = request.method === "GET" || request.method === "HEAD"
    ? undefined
    : await request.arrayBuffer();

  const headers = await buildUpstreamHeaders({
    body,
    config,
    now,
    request,
    selected,
  });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.requestTimeoutMs);

  try {
    const upstreamResponse = await fetcher(selected.targetUrl, {
      body,
      headers,
      method: request.method,
      redirect: "manual",
      signal: controller.signal,
    });

    return new Response(upstreamResponse.body, {
      headers: responseHeaders(upstreamResponse.headers),
      status: upstreamResponse.status,
      statusText: upstreamResponse.statusText,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      return textResponse("gateway timeout\n", 504);
    }

    console.error("[bunny-tunnel-edge-script] upstream request failed", error);
    return textResponse("bad gateway\n", 502);
  } finally {
    clearTimeout(timeout);
  }
}

async function buildUpstreamHeaders(
  options: {
    body: ArrayBuffer | undefined;
    config: NormalizedConfig;
    now: () => Date;
    request: Request;
    selected: SelectedRoute;
  },
): Promise<Headers> {
  const headers = requestHeaders(options.request.headers);
  const originalUrl = new URL(options.request.url);
  const originalHost = originalUrl.host;
  const clientIp = firstHeaderValue(
    options.request.headers.get("x-forwarded-for") ??
      options.request.headers.get("x-real-ip") ??
      "",
  );

  if (options.config.preserveHostHeader) {
    headers.set("host", originalHost);
  } else {
    headers.set("host", options.selected.targetUrl.host);
  }

  headers.set("x-forwarded-host", originalHost);
  headers.set("x-forwarded-proto", originalUrl.protocol.replace(":", ""));
  headers.set("x-forwarded-uri", originalUrl.pathname + originalUrl.search);
  headers.set("x-original-host", originalHost);

  if (clientIp) {
    headers.set("x-forwarded-for", clientIp);
  }

  if (options.config.originSharedSecret) {
    const timestamp = Math.floor(options.now().getTime() / 1000).toString();
    const bodyHash = await sha256Hex(options.body ?? new ArrayBuffer(0));
    const signedTarget = options.selected.targetUrl.pathname +
      options.selected.targetUrl.search;
    const payload = [
      options.request.method.toUpperCase(),
      signedTarget,
      timestamp,
      bodyHash,
    ].join("\n");

    headers.set("x-bunny-tunnel-version", SIGNATURE_VERSION);
    headers.set("x-bunny-tunnel-timestamp", timestamp);
    headers.set("x-bunny-tunnel-body-sha256", bodyHash);
    headers.set(
      "x-bunny-tunnel-signature",
      `${SIGNATURE_VERSION}=${await hmacSha256Hex(
        options.config.originSharedSecret,
        payload,
      )}`,
    );
  }

  return headers;
}

function readRoutes(env: EnvReader): TunnelRoute[] {
  const routesJson = optionalString(env.get("TUNNEL_ROUTES"));
  if (routesJson) {
    const parsed = JSON.parse(routesJson) as unknown;
    if (!Array.isArray(parsed)) {
      throw new Error("TUNNEL_ROUTES must be a JSON array.");
    }

    return parsed.map(readRoute);
  }

  const origin = optionalString(env.get("TUNNEL_ORIGIN"));
  if (!origin) {
    return [];
  }

  return [{
    host: optionalString(env.get("TUNNEL_HOST")),
    origin,
    pathPrefix: optionalString(env.get("TUNNEL_PATH_PREFIX")) ?? "/",
  }];
}

function readRoute(value: unknown): TunnelRoute {
  if (!value || typeof value !== "object") {
    throw new Error("Each TUNNEL_ROUTES entry must be an object.");
  }

  const route = value as Record<string, unknown>;
  if (typeof route.origin !== "string") {
    throw new Error("Each TUNNEL_ROUTES entry needs an origin string.");
  }

  return {
    host: typeof route.host === "string" ? route.host : undefined,
    origin: route.origin,
    pathPrefix: typeof route.pathPrefix === "string" ? route.pathPrefix : "/",
  };
}

function normalizeConfig(
  config: RuntimeConfig,
): NormalizedConfig {
  const allowedMethods = config.allowedMethods.length > 0
    ? config.allowedMethods.map((method) => method.toUpperCase())
    : DEFAULT_ALLOWED_METHODS;

  return {
    ...config,
    allowedMethods,
    deniedPathPrefixes: config.deniedPathPrefixes.map(normalizePath),
    healthPath: normalizePath(config.healthPath),
    routes: config.routes.map(normalizeRoute).sort((a, b) => {
      const hostScore = Number(Boolean(b.host)) - Number(Boolean(a.host));
      if (hostScore !== 0) {
        return hostScore;
      }

      return b.pathPrefix.length - a.pathPrefix.length;
    }),
  };
}

function normalizeRoute(route: TunnelRoute): NormalizedRoute {
  const origin = new URL(route.origin);
  if (origin.protocol !== "https:" && origin.protocol !== "http:") {
    throw new Error(`Unsupported route origin protocol: ${origin.protocol}`);
  }

  return {
    host: route.host ? normalizeHost(route.host) : undefined,
    origin,
    pathPrefix: normalizePath(route.pathPrefix ?? "/"),
  };
}

function selectRoute(
  requestUrl: URL,
  routes: NormalizedRoute[],
): SelectedRoute | undefined {
  const requestHost = normalizeHost(requestUrl.hostname);

  for (const route of routes) {
    if (route.host && !hostMatches(requestHost, route.host)) {
      continue;
    }

    if (!pathMatches(requestUrl.pathname, route.pathPrefix)) {
      continue;
    }

    return {
      route,
      targetUrl: targetUrlForRoute(requestUrl, route),
    };
  }

  return undefined;
}

function targetUrlForRoute(requestUrl: URL, route: NormalizedRoute): URL {
  const targetUrl = new URL(route.origin);
  const originBasePath = trimTrailingSlash(targetUrl.pathname);
  const remainingPath = route.pathPrefix === "/"
    ? requestUrl.pathname
    : requestUrl.pathname.slice(route.pathPrefix.length) || "/";

  targetUrl.pathname = joinPaths(originBasePath || "/", remainingPath);
  targetUrl.search = requestUrl.search;
  return targetUrl;
}

function hostMatches(host: string, pattern: string): boolean {
  if (pattern.startsWith("*.")) {
    const suffix = pattern.slice(1);
    return host.endsWith(suffix) && host.length > suffix.length;
  }

  return host === pattern;
}

function pathMatches(pathname: string, prefix: string): boolean {
  if (prefix === "/") {
    return true;
  }

  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

function isDeniedPath(pathname: string, deniedPrefixes: string[]): boolean {
  return deniedPrefixes.some((prefix) => pathMatches(pathname, prefix));
}

function isHttpsRequest(request: Request): boolean {
  const url = new URL(request.url);
  if (url.protocol === "https:") {
    return true;
  }

  const forwardedProto = firstHeaderValue(
    request.headers.get("x-forwarded-proto") ?? "",
  ).toLowerCase();
  return forwardedProto === "https";
}

function isViewerAuthorized(request: Request, viewerTokens: string[]): boolean {
  if (viewerTokens.length === 0) {
    return true;
  }

  const authorization = request.headers.get("authorization") ?? "";
  const bearerPrefix = "Bearer ";
  if (!authorization.startsWith(bearerPrefix)) {
    return false;
  }

  const token = authorization.slice(bearerPrefix.length);
  return viewerTokens.some((knownToken) => timingSafeEqual(token, knownToken));
}

function requestHeaders(input: Headers): Headers {
  const headers = new Headers();
  for (const [name, value] of input) {
    const normalized = name.toLowerCase();
    if (HOP_BY_HOP_HEADERS.has(normalized) || normalized === "content-length") {
      continue;
    }

    if (normalized === "authorization") {
      continue;
    }

    headers.set(name, value);
  }

  return headers;
}

function responseHeaders(input: Headers): Headers {
  const headers = new Headers();
  for (const [name, value] of input) {
    const normalized = name.toLowerCase();
    if (HOP_BY_HOP_HEADERS.has(normalized)) {
      continue;
    }

    headers.set(name, value);
  }

  return headers;
}

function jsonResponse(value: unknown): Response {
  return new Response(`${JSON.stringify(value)}\n`, {
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

function textResponse(
  body: string,
  status: number,
  headers?: Record<string, string>,
): Response {
  return new Response(body, {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      ...headers,
    },
    status,
  });
}

function splitList(value: string | undefined): string[] {
  return optionalString(value)?.split(",").map((item) => item.trim()).filter(
    Boolean,
  ) ?? [];
}

function optionalString(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function readBoolean(value: string | undefined): boolean {
  return ["1", "true", "yes", "on"].includes(value?.trim().toLowerCase() ?? "");
}

function readInteger(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function normalizePath(pathname: string): string {
  const prefixed = pathname.startsWith("/") ? pathname : `/${pathname}`;
  return prefixed.length > 1 ? trimTrailingSlash(prefixed) : prefixed;
}

function normalizeHost(host: string): string {
  return host.trim().toLowerCase().replace(/\.$/, "");
}

function trimTrailingSlash(value: string): string {
  return value.length > 1 ? value.replace(/\/+$/, "") : value;
}

function joinPaths(basePath: string, nextPath: string): string {
  const base = trimTrailingSlash(basePath || "/");
  const next = nextPath.startsWith("/") ? nextPath : `/${nextPath}`;
  return base === "/" ? next : `${base}${next}`;
}

function firstHeaderValue(value: string): string {
  return value.split(",")[0]?.trim() ?? "";
}

function timingSafeEqual(a: string, b: string): boolean {
  const encoder = new TextEncoder();
  const left = encoder.encode(a);
  const right = encoder.encode(b);
  const length = Math.max(left.length, right.length);
  let diff = left.length ^ right.length;

  for (let index = 0; index < length; index += 1) {
    diff |= (left[index] ?? 0) ^ (right[index] ?? 0);
  }

  return diff === 0;
}

async function sha256Hex(body: ArrayBuffer): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", body);
  return hex(new Uint8Array(hash));
}

async function hmacSha256Hex(secret: string, payload: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { hash: "SHA-256", name: "HMAC" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(payload),
  );
  return hex(new Uint8Array(signature));
}

function hex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
