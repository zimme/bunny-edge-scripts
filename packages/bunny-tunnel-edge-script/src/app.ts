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
  allowPublic: boolean;
  viewerTokens: string[];
  originSharedSecret?: string;
  allowedMethods: string[];
  deniedPathPrefixes: string[];
  allowInsecureHttp: boolean;
  allowInsecureOrigin: boolean;
  healthPath: string;
  maxBodyBytes: number;
  preserveHostHeader: boolean;
  requestTimeoutMs: number;
}

export interface VerifySignatureOptions {
  body?: ArrayBuffer;
  expectedOrigin?: string | URL;
  maxBodyBytes?: number;
  now?: () => Date;
  replayCache?: SignatureReplayCache;
  toleranceSeconds?: number;
}

export interface SignatureReplayCache {
  consume(nonce: string, expiresAtSeconds: number): boolean | Promise<boolean>;
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
  "proxy-connection",
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
const DEFAULT_MAX_BODY_BYTES = 10 * 1024 * 1024;
const MAX_BODY_BYTES = 10 * 1024 * 1024;
const DEFAULT_SIGNATURE_TOLERANCE_SECONDS = 300;
const MAX_SIGNATURE_TOLERANCE_SECONDS = 3600;
const MAX_REPLAY_CACHE_ENTRIES = 10_000;
const SIGNATURE_VERSION = "v2";
const signatureReplayCache = new Map<string, number>();

export function readBunnyTunnelConfigFromEnv(env: EnvReader): RuntimeConfig {
  const routes = readRoutes(env);

  if (routes.length === 0) {
    throw new Error("Missing required TUNNEL_ORIGIN or TUNNEL_ROUTES secret.");
  }

  const healthPath = normalizePath(
    env.get("TUNNEL_HEALTH_PATH") ?? DEFAULT_HEALTH_PATH,
  );
  const viewerTokens = splitList(
    env.get("TUNNEL_VIEWER_TOKENS") ?? env.get("TUNNEL_VIEWER_TOKEN"),
  );
  const allowPublic = readBoolean(env.get("TUNNEL_ALLOW_PUBLIC"));
  if (viewerTokens.length === 0 && !allowPublic) {
    throw new Error(
      "Missing TUNNEL_VIEWER_TOKEN. Set TUNNEL_ALLOW_PUBLIC=true only for an intentionally public origin.",
    );
  }

  const configuredAllowedMethods = splitList(
    env.get("TUNNEL_ALLOWED_METHODS"),
  ).map((method) => method.toUpperCase());

  const config = {
    routes,
    allowPublic,
    viewerTokens,
    originSharedSecret: optionalString(env.get("TUNNEL_ORIGIN_SHARED_SECRET")),
    allowedMethods: configuredAllowedMethods.length > 0
      ? configuredAllowedMethods
      : DEFAULT_ALLOWED_METHODS,
    deniedPathPrefixes: splitList(env.get("TUNNEL_DENIED_PATH_PREFIXES"))
      .map(normalizePath),
    allowInsecureHttp: readBoolean(env.get("TUNNEL_ALLOW_INSECURE_HTTP")),
    allowInsecureOrigin: readBoolean(
      env.get("TUNNEL_ALLOW_INSECURE_ORIGIN"),
    ),
    healthPath,
    maxBodyBytes: readInteger(
      env.get("TUNNEL_MAX_BODY_BYTES"),
      DEFAULT_MAX_BODY_BYTES,
      1,
      MAX_BODY_BYTES,
      "TUNNEL_MAX_BODY_BYTES",
    ),
    preserveHostHeader: readBoolean(env.get("TUNNEL_PRESERVE_HOST_HEADER")),
    requestTimeoutMs: readInteger(
      env.get("TUNNEL_REQUEST_TIMEOUT_MS"),
      30000,
      1,
      120000,
      "TUNNEL_REQUEST_TIMEOUT_MS",
    ),
  };
  normalizeConfig(config);
  return config;
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

  if (!config.allowInsecureHttp && !isHttpsRequest(request)) {
    return textResponse("HTTPS required\n", 400);
  }

  const canonicalPathname = canonicalPathnameForSecurity(requestUrl.pathname);
  if (!canonicalPathname) {
    return textResponse("invalid path\n", 400);
  }

  if (canonicalPathname === config.healthPath) {
    return jsonResponse({ ok: true, service: "bunny-tunnel-edge-script" });
  }

  if (!config.allowedMethods.includes(request.method.toUpperCase())) {
    return textResponse("method not allowed\n", 405, {
      allow: config.allowedMethods.join(", "),
    });
  }

  if (isDeniedPath(canonicalPathname, config.deniedPathPrefixes)) {
    return textResponse("not found\n", 404);
  }

  if (!isViewerAuthorized(request, config.viewerTokens)) {
    return textResponse("unauthorized\n", 401, {
      "www-authenticate": 'Bearer realm="@zimme/bunny-tunnel-edge-script"',
    });
  }

  const selected = selectRoute(requestUrl, canonicalPathname, config.routes);
  if (!selected) {
    return textResponse("no route\n", 404);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.requestTimeoutMs);
  let bodyResult;
  try {
    bodyResult = await readRequestBody(
      request,
      config.maxBodyBytes,
      controller.signal,
    );
  } catch (error) {
    clearTimeout(timeout);
    if (error instanceof DOMException && error.name === "AbortError") {
      return textResponse("gateway timeout\n", 504);
    }
    throw error;
  }
  if (bodyResult.kind === "too-large") {
    clearTimeout(timeout);
    return textResponse("request body too large\n", 413);
  }
  const body = bodyResult.body;

  try {
    const headers = await buildUpstreamHeaders({
      body,
      config,
      now,
      request,
      selected,
    });
    const upstreamResponse = await fetcher(selected.targetUrl, {
      body,
      headers,
      method: request.method,
      redirect: "manual",
      signal: controller.signal,
    });

    return new Response(
      deadlineBody(upstreamResponse.body, controller, timeout),
      {
        headers: responseHeaders(upstreamResponse.headers),
        status: upstreamResponse.status,
        statusText: upstreamResponse.statusText,
      },
    );
  } catch (error) {
    clearTimeout(timeout);
    if (error instanceof DOMException && error.name === "AbortError") {
      return textResponse("gateway timeout\n", 504);
    }

    console.error("[bunny-tunnel-edge-script] upstream request failed", error);
    return textResponse("bad gateway\n", 502);
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

  if (options.config.preserveHostHeader) {
    headers.set("host", originalHost);
  } else {
    headers.set("host", options.selected.targetUrl.host);
  }

  headers.set("x-forwarded-host", originalHost);
  headers.set("x-forwarded-proto", originalUrl.protocol.replace(":", ""));
  headers.set("x-forwarded-uri", originalUrl.pathname + originalUrl.search);
  headers.set("x-original-host", originalHost);

  if (options.config.originSharedSecret) {
    const timestamp = Math.floor(options.now().getTime() / 1000).toString();
    const nonce = randomNonce();
    const bodyHash = await sha256Hex(options.body ?? new ArrayBuffer(0));
    const signedTarget = options.selected.targetUrl.pathname +
      options.selected.targetUrl.search;
    const payload = [
      options.request.method.toUpperCase(),
      options.selected.targetUrl.origin,
      signedTarget,
      timestamp,
      nonce,
      bodyHash,
    ].join("\n");

    headers.set("x-bunny-tunnel-version", SIGNATURE_VERSION);
    headers.set("x-bunny-tunnel-origin", options.selected.targetUrl.origin);
    headers.set("x-bunny-tunnel-timestamp", timestamp);
    headers.set("x-bunny-tunnel-nonce", nonce);
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

export async function verifyBunnyTunnelSignature(
  request: Request,
  secret: string,
  options: VerifySignatureOptions = {},
): Promise<boolean> {
  const version = request.headers.get("x-bunny-tunnel-version");
  const signedOrigin = request.headers.get("x-bunny-tunnel-origin") ?? "";
  const timestamp = request.headers.get("x-bunny-tunnel-timestamp") ?? "";
  const nonce = request.headers.get("x-bunny-tunnel-nonce") ?? "";
  const bodyHash = request.headers.get("x-bunny-tunnel-body-sha256") ?? "";
  const signature = request.headers.get("x-bunny-tunnel-signature") ?? "";
  if (
    !secret || version !== SIGNATURE_VERSION || !signedOrigin ||
    !/^\d+$/.test(timestamp) ||
    !/^[a-f0-9]{32}$/.test(nonce) ||
    !/^[a-f0-9]{64}$/.test(bodyHash) ||
    !signature.startsWith(`${SIGNATURE_VERSION}=`)
  ) {
    return false;
  }

  const now = options.now ?? (() => new Date());
  const tolerance = options.toleranceSeconds ??
    DEFAULT_SIGNATURE_TOLERANCE_SECONDS;
  const maxBodyBytes = options.maxBodyBytes ?? DEFAULT_MAX_BODY_BYTES;
  const timestampSeconds = Number(timestamp);
  const nowSeconds = Math.floor(now().getTime() / 1000);
  if (
    !Number.isSafeInteger(timestampSeconds) ||
    !Number.isSafeInteger(tolerance) || tolerance < 0 ||
    tolerance > MAX_SIGNATURE_TOLERANCE_SECONDS ||
    !Number.isSafeInteger(maxBodyBytes) || maxBodyBytes < 1 ||
    maxBodyBytes > MAX_BODY_BYTES ||
    Math.abs(nowSeconds - timestampSeconds) > tolerance
  ) {
    return false;
  }

  const url = new URL(request.url);
  let expectedOrigin: string;
  try {
    expectedOrigin = options.expectedOrigin
      ? new URL(options.expectedOrigin).origin
      : url.origin;
  } catch {
    return false;
  }
  if (signedOrigin !== expectedOrigin) {
    return false;
  }
  const payload = [
    request.method.toUpperCase(),
    signedOrigin,
    url.pathname + url.search,
    timestamp,
    nonce,
    bodyHash,
  ].join("\n");
  const expected = `${SIGNATURE_VERSION}=${await hmacSha256Hex(
    secret,
    payload,
  )}`;
  if (!timingSafeEqual(signature, expected)) {
    return false;
  }

  let body = options.body;
  if (body && body.byteLength > maxBodyBytes) {
    return false;
  }
  if (!body) {
    const bodyResult = await readRequestBody(request.clone(), maxBodyBytes);
    if (bodyResult.kind === "too-large") {
      return false;
    }
    body = bodyResult.body ?? new ArrayBuffer(0);
  }
  if (!timingSafeEqual(await sha256Hex(body), bodyHash)) {
    return false;
  }

  const expiresAtSeconds = timestampSeconds + tolerance;
  try {
    return options.replayCache
      ? await options.replayCache.consume(nonce, expiresAtSeconds)
      : consumeReplayNonce(nonce, expiresAtSeconds, nowSeconds);
  } catch {
    return false;
  }
}

function readRoutes(env: EnvReader): TunnelRoute[] {
  const routesJson = optionalString(env.get("TUNNEL_ROUTES"));
  if (routesJson) {
    if (new TextEncoder().encode(routesJson).byteLength > 2048) {
      throw new Error("TUNNEL_ROUTES exceeds Bunny's 2 KB environment limit.");
    }
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
  const allowedKeys = new Set(["origin", "host", "pathPrefix"]);
  if (Object.keys(route).some((key) => !allowedKeys.has(key))) {
    throw new Error("TUNNEL_ROUTES entries contain an unknown property.");
  }
  if (typeof route.origin !== "string" || !route.origin.trim()) {
    throw new Error("Each TUNNEL_ROUTES entry needs an origin string.");
  }
  if ("host" in route && typeof route.host !== "string") {
    throw new Error("TUNNEL_ROUTES host must be a string.");
  }
  if ("pathPrefix" in route && typeof route.pathPrefix !== "string") {
    throw new Error("TUNNEL_ROUTES pathPrefix must be a string.");
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
  if (config.viewerTokens.length === 0 && !config.allowPublic) {
    throw new Error(
      "At least one viewer token is required unless allowPublic is true.",
    );
  }

  const allowedMethods = config.allowedMethods.length > 0
    ? config.allowedMethods.map((method) => method.toUpperCase())
    : DEFAULT_ALLOWED_METHODS;
  if (
    allowedMethods.some((method) => !/^[A-Z]+$/.test(method)) ||
    !Number.isSafeInteger(config.maxBodyBytes) || config.maxBodyBytes < 1 ||
    config.maxBodyBytes > MAX_BODY_BYTES ||
    !Number.isSafeInteger(config.requestTimeoutMs) ||
    config.requestTimeoutMs < 1 || config.requestTimeoutMs > 120000
  ) {
    throw new Error("Invalid tunnel method, body, or timeout configuration.");
  }

  const routes = config.routes.map((route) =>
    normalizeRoute(route, config.allowInsecureOrigin)
  );
  const routeKeys = new Set<string>();
  for (const route of routes) {
    const key = `${route.host ?? "*"}\n${route.pathPrefix}`;
    if (routeKeys.has(key)) {
      throw new Error(
        "Tunnel routes must not have duplicate host/path matches.",
      );
    }
    routeKeys.add(key);
  }

  return {
    ...config,
    allowedMethods,
    deniedPathPrefixes: config.deniedPathPrefixes.map(normalizeSecurePath),
    healthPath: normalizeSecurePath(config.healthPath),
    routes: routes.sort((a, b) => {
      const hostScore = hostSpecificity(b.host) - hostSpecificity(a.host);
      if (hostScore !== 0) {
        return hostScore;
      }

      if (a.host?.startsWith("*.") && b.host?.startsWith("*.")) {
        const suffixScore = b.host.length - a.host.length;
        if (suffixScore !== 0) {
          return suffixScore;
        }
      }

      return b.pathPrefix.length - a.pathPrefix.length;
    }),
  };
}

function normalizeRoute(
  route: TunnelRoute,
  allowInsecureOrigin: boolean,
): NormalizedRoute {
  const origin = new URL(route.origin);
  if (
    origin.protocol !== "https:" &&
    !(allowInsecureOrigin && origin.protocol === "http:")
  ) {
    throw new Error(`Unsupported route origin protocol: ${origin.protocol}`);
  }
  if (origin.username || origin.password || origin.hash) {
    throw new Error("Tunnel origins cannot contain credentials or fragments.");
  }
  if (origin.search) {
    throw new Error("Tunnel origins cannot contain a query string.");
  }

  return {
    host: route.host === undefined
      ? undefined
      : normalizeHostPattern(route.host),
    origin,
    pathPrefix: normalizeSecurePath(route.pathPrefix ?? "/"),
  };
}

function selectRoute(
  requestUrl: URL,
  canonicalPathname: string,
  routes: NormalizedRoute[],
): SelectedRoute | undefined {
  const requestHost = normalizeHost(requestUrl.hostname);

  for (const route of routes) {
    if (route.host && !hostMatches(requestHost, route.host)) {
      continue;
    }

    if (!pathMatches(canonicalPathname, route.pathPrefix)) {
      continue;
    }

    return {
      route,
      targetUrl: targetUrlForRoute(requestUrl, canonicalPathname, route),
    };
  }

  return undefined;
}

function targetUrlForRoute(
  requestUrl: URL,
  canonicalPathname: string,
  route: NormalizedRoute,
): URL {
  const targetUrl = new URL(route.origin);
  const originBasePath = trimTrailingSlash(targetUrl.pathname);
  const remainingPath = route.pathPrefix === "/"
    ? canonicalPathname
    : canonicalPathname.slice(route.pathPrefix.length) || "/";

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

  return pathname === prefix || pathname.startsWith(`${prefix}/`) ||
    pathname.startsWith(`${prefix};`);
}

function isDeniedPath(pathname: string, deniedPrefixes: string[]): boolean {
  return deniedPrefixes.some((prefix) => pathMatches(pathname, prefix));
}

function isHttpsRequest(request: Request): boolean {
  const url = new URL(request.url);
  return url.protocol === "https:";
}

function isViewerAuthorized(request: Request, viewerTokens: string[]): boolean {
  if (viewerTokens.length === 0) {
    return true;
  }

  const authorization = request.headers.get("authorization") ?? "";
  const match = authorization.match(/^([^ ]+) ([^ ]+)$/);
  if (!match || match[1].toLowerCase() !== "bearer") {
    return false;
  }
  const token = match[2];
  return viewerTokens.some((knownToken) => timingSafeEqual(token, knownToken));
}

function requestHeaders(input: Headers): Headers {
  const connectionHeaders = connectionHeaderNames(input);
  const headers = new Headers();
  for (const [name, value] of input) {
    const normalized = name.toLowerCase();
    if (
      HOP_BY_HOP_HEADERS.has(normalized) || connectionHeaders.has(normalized) ||
      normalized === "content-length" || normalized === "forwarded" ||
      normalized.startsWith("x-forwarded-") ||
      normalized.startsWith("x-original-") ||
      normalized.startsWith("x-bunny-tunnel-")
    ) {
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
  const connectionHeaders = connectionHeaderNames(input);
  const headers = new Headers();
  for (const [name, value] of input) {
    const normalized = name.toLowerCase();
    if (
      HOP_BY_HOP_HEADERS.has(normalized) || connectionHeaders.has(normalized)
    ) {
      continue;
    }

    if (normalized !== "set-cookie") {
      headers.append(name, value);
    }
  }
  for (const cookie of input.getSetCookie()) {
    headers.append("set-cookie", cookie);
  }

  return headers;
}

function jsonResponse(value: unknown): Response {
  return new Response(`${JSON.stringify(value)}\n`, {
    headers: {
      "cache-control": "no-store",
      "content-type": "application/json; charset=utf-8",
    },
  });
}

function textResponse(
  body: string,
  status: number,
  headers?: Record<string, string>,
): Response {
  return new Response(body, {
    headers: {
      "cache-control": "no-store",
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
  const normalized = value?.trim().toLowerCase();
  if (!normalized || ["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }
  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }
  throw new Error(`Invalid boolean value: ${value}`);
}

function readInteger(
  value: string | undefined,
  fallback: number,
  min: number,
  max: number,
  name: string,
): number {
  if (!value || value.trim() === "") {
    return fallback;
  }
  if (!/^\d+$/.test(value.trim())) {
    throw new Error(`${name} must be an integer.`);
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < min || parsed > max) {
    throw new Error(`${name} must be between ${min} and ${max}.`);
  }
  return parsed;
}

function normalizePath(pathname: string): string {
  const prefixed = pathname.startsWith("/") ? pathname : `/${pathname}`;
  return prefixed.length > 1 ? trimTrailingSlash(prefixed) : prefixed;
}

function normalizeSecurePath(pathname: string): string {
  const canonical = canonicalPathnameForSecurity(normalizePath(pathname));
  if (!canonical) {
    throw new Error(`Invalid tunnel path: ${pathname}`);
  }
  return canonical;
}

function normalizeHost(host: string): string {
  return host.trim().toLowerCase().replace(/\.$/, "");
}

function normalizeHostPattern(host: string): string {
  const normalized = normalizeHost(host);
  const wildcard = normalized.startsWith("*.");
  const hostname = wildcard ? normalized.slice(2) : normalized;
  if (
    !hostname || hostname.includes(":") || hostname.includes("*") ||
    !/^[a-z0-9.-]+$/.test(hostname)
  ) {
    throw new Error(`Invalid tunnel route host: ${host}`);
  }
  let parsed: string;
  try {
    parsed = new URL(`https://${hostname}`).hostname;
  } catch {
    throw new Error(`Invalid tunnel route host: ${host}`);
  }
  if (parsed !== hostname || parsed.split(".").some((label) => !label)) {
    throw new Error(`Invalid tunnel route host: ${host}`);
  }
  return wildcard ? `*.${parsed}` : parsed;
}

function hostSpecificity(host: string | undefined): number {
  if (!host) return 0;
  return host.startsWith("*.") ? 1 : 2;
}

function trimTrailingSlash(value: string): string {
  let end = value.length;
  while (end > 1 && value.charCodeAt(end - 1) === 47) {
    end -= 1;
  }
  return value.slice(0, end);
}

function joinPaths(basePath: string, nextPath: string): string {
  const base = trimTrailingSlash(basePath || "/");
  const next = nextPath.startsWith("/") ? nextPath : `/${nextPath}`;
  return base === "/" ? next : `${base}${next}`;
}

function connectionHeaderNames(headers: Headers): Set<string> {
  return new Set(
    (headers.get("connection") ?? "").split(",").map((name) =>
      name.trim().toLowerCase()
    ).filter(Boolean),
  );
}

function canonicalPathnameForSecurity(pathname: string): string | undefined {
  for (let index = 0; index < pathname.length; index += 1) {
    if (pathname[index] !== "%") {
      continue;
    }

    const encodedByte = pathname.slice(index + 1, index + 3);
    if (!/^[a-f0-9]{2}$/i.test(encodedByte)) {
      return undefined;
    }

    const byte = Number.parseInt(encodedByte, 16);
    if (byte === 0x25 || byte === 0x2f || byte === 0x5c) {
      return undefined;
    }
    index += 2;
  }

  try {
    const decoded = decodeURIComponent(pathname);
    for (let index = 0; index < decoded.length; index += 1) {
      const code = decoded.charCodeAt(index);
      if (code <= 0x1f || code === 0x7f || code === 0x5c) {
        return undefined;
      }
    }
    return decoded.replace(/\/{2,}/g, "/");
  } catch {
    return undefined;
  }
}

function randomNonce(): string {
  return hex(crypto.getRandomValues(new Uint8Array(16)));
}

function consumeReplayNonce(
  nonce: string,
  expiresAtSeconds: number,
  nowSeconds: number,
): boolean {
  for (const [cachedNonce, expiry] of signatureReplayCache) {
    if (expiry < nowSeconds) {
      signatureReplayCache.delete(cachedNonce);
    }
  }

  if (
    signatureReplayCache.has(nonce) ||
    signatureReplayCache.size >= MAX_REPLAY_CACHE_ENTRIES
  ) {
    return false;
  }

  signatureReplayCache.set(nonce, expiresAtSeconds);
  return true;
}

async function readRequestBody(
  request: Request,
  maxBytes: number,
  signal?: AbortSignal,
): Promise<
  { kind: "ok"; body: ArrayBuffer | undefined } | { kind: "too-large" }
> {
  if (request.method === "GET" || request.method === "HEAD" || !request.body) {
    return { kind: "ok", body: undefined };
  }

  const contentLength = request.headers.get("content-length");
  if (
    contentLength && /^\d+$/.test(contentLength) &&
    Number(contentLength) > maxBytes
  ) {
    return { kind: "too-large" };
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    let result: ReadableStreamReadResult<Uint8Array>;
    try {
      result = await readWithAbort(reader, signal);
    } catch (error) {
      await reader.cancel().catch(() => {});
      throw error;
    }
    const { done, value } = result;
    if (done) {
      break;
    }

    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      return { kind: "too-large" };
    }
    chunks.push(value);
  }

  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { kind: "ok", body: body.buffer };
}

async function readWithAbort(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  signal?: AbortSignal,
): Promise<ReadableStreamReadResult<Uint8Array>> {
  if (!signal) return await reader.read();
  if (signal.aborted) throw new DOMException("Aborted", "AbortError");
  return await new Promise((resolve, reject) => {
    const onAbort = () => reject(new DOMException("Aborted", "AbortError"));
    signal.addEventListener("abort", onAbort, { once: true });
    reader.read().then(
      (result) => {
        signal.removeEventListener("abort", onAbort);
        resolve(result);
      },
      (error) => {
        signal.removeEventListener("abort", onAbort);
        reject(error);
      },
    );
  });
}

function deadlineBody(
  body: ReadableStream<Uint8Array> | null,
  controller: AbortController,
  timeout: ReturnType<typeof setTimeout>,
): ReadableStream<Uint8Array> | null {
  if (!body) {
    clearTimeout(timeout);
    return null;
  }
  const reader = body.getReader();
  return new ReadableStream({
    async pull(streamController) {
      try {
        const result = await readWithAbort(reader, controller.signal);
        if (result.done) {
          clearTimeout(timeout);
          streamController.close();
        } else {
          streamController.enqueue(result.value);
        }
      } catch (error) {
        clearTimeout(timeout);
        streamController.error(error);
      }
    },
    async cancel(reason) {
      clearTimeout(timeout);
      controller.abort();
      await reader.cancel(reason);
    },
  });
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
