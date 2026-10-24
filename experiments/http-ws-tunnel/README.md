# HTTP/WebSocket Rendezvous Probe (Experiment)

This directory is an unpublished local experiment, not a supported product or
deployment. Its milestone tests whether one Bunny Edge Script isolate can
rendezvous a probe request with a connected local connector over WebSocket. The
probe returns the connector's echoed bytes; it is not an HTTP proxy to a local
origin.

Keep this experiment outside the DDNS workspace, package/version/release and
publishing flows. Do not add a registry package name, attach it to the root Deno
workspace, or imply production routing. The root `deno.json` adds only a
validation aggregator; the experiment is not a workspace member, and no package
metadata or lockfile changes are required.

## Shape

- A dependency-free Deno edge gateway owns protocol and probe behavior.
- The gateway receives a WebSocket-upgrade adapter as a dependency. Its Bunny
  entrypoint supplies Bunny's request upgrade adapter and runtime lifecycle
  integration; the protocol core must not import the Bunny SDK.
- A local adapter may use `Deno.serve` over HTTP only when bound to loopback for
  an explicit local harness. This is not a remotely exposed HTTP deployment.
- Configure exactly one hostname with `TUNNEL_PROBE_HOSTNAME` and two
  independent bearer credentials, each 32-256 URL-safe characters (`A-Z`, `a-z`,
  `0-9`, `_`, `-`): `TUNNEL_PROBE_CONNECTOR_TOKEN` and
  `TUNNEL_PROBE_VIEWER_TOKEN`. The connector credential authenticates
  `/__probe/connect`; the viewer credential authenticates `GET /__probe`. The
  values must be independent. Authorization is exactly `Bearer <token>` with
  case-sensitive `Bearer`; query credentials are rejected. Supply variables
  through a user-owned private environment for the local process or Bunny
  runtime. Never put secret literals in source, commands, logs, or fixtures, and
  do not ask a person to enter credentials into an agent-controlled terminal.
  Tests generate ephemeral credentials and require no human credential step.
- Enforce the configured hostname exactly. Do not permit wildcard, suffix, or
  account-wide matching. The explicit local harness exception is only
  `http://127.0.0.1`; production requests require HTTPS and the configured host.

## Probe behavior

`GET /__probe/connect` authenticates the connector and upgrades using the
`bunny-rendezvous-v1` WebSocket subprotocol. On registration, the server sends
JSON with `type: "registered"`, `version: 1`, `isolateId`, `sessionId`, and
`hostname`. The connector sends exactly `{"type":"heartbeat"}` every ten seconds
and receives exactly `{"type":"heartbeat-ack"}`.

An authenticated `GET /__probe` creates a challenge consisting of exactly 36
ASCII UUID bytes followed by 32 cryptographically random bytes (68 bytes total).
The server dispatches that fixed binary frame to the registered connector and
accepts only a returned frame matching the challenge. A successful probe
responds with the echoed 32 random payload bytes, not a forwarded HTTP response.
Include `x-probe-request-id`, `x-probe-session-id`, and `x-probe-isolate-id`
response headers when those identifiers are known.

The implementation allows one active connector per gateway factory instance (a
replacement closes the old connection and fails its pending probes), eight
pending probes, a three-second probe timeout, a ten-second heartbeat interval, a
thirty-second idle bound, and a five-minute session lifetime before rotation. It
accepts control messages up to 512 UTF-8 bytes and guards WebSocket sends
against a 4 KiB buffered-amount limit. Bunny's platform-specific limits for
long-lived connections, frames, and isolate lifetime still need verification.

Each `createProbeGateway` factory instance generates an `isolateId` and models
one isolate in local tests. The mapping from a factory instance to a real Bunny
runtime isolate and its lifetime is not verified. If a request reaches an
instance with no registered connector, return HTTP 503. Do not fake routing to
another instance. This milestone has no global rendezvous, shared registry,
routing guarantee, or production traffic path. Being in the same region does not
establish that two requests reach the same instance.

## Local commands

Run repository validation in the Docker Compose development container. The root
`experiment:tunnel` task aggregates experiment type checks, lint, and tests. Its
`check` task checks types for the Bunny adapter in `edge/bunny.ts`. There is no
`edge` task and no deployment task. Existing DDNS and generator package tasks
are unchanged; this experiment is not a published package.

```sh
docker compose -f .devcontainer/compose.yaml exec --user vscode development deno task experiment:tunnel
```

The optional local gateway requires all three variables supplied through the
user-owned private environment and binds HTTP only to `127.0.0.1:8787`. Start
the connector in a second container terminal with its connector token supplied
the same way:

```sh
docker compose -f .devcontainer/compose.yaml exec --user vscode development deno task --config experiments/http-ws-tunnel/deno.json local
docker compose -f .devcontainer/compose.yaml exec --user vscode development deno task --config experiments/http-ws-tunnel/deno.json connector ws://127.0.0.1:8787/__probe/connect --loopback
```

An authenticated viewer `GET /__probe` can be issued to `http://127.0.0.1:8787`
with `TUNNEL_PROBE_VIEWER_TOKEN` supplied privately to the caller. These local
commands do not deploy or connect to a cloud environment. Do not publish or
deploy this experiment.

## Boundaries and open questions

Bunny documents WebSocket upgrades and recommends `waitUntil` to keep work
associated with an open socket alive. Its public limits page describes per-
request CPU, memory, subrequest, script-size, startup, and environment-variable
limits, but does not settle this experiment's long-lived session behavior or
frame/connection quotas. Account for CPU time and isolate lifetime explicitly;
do not assume an open WebSocket makes arbitrary background work free or
indefinite. Verify runtime-specific idle, frame-size, connection-count, and
lifetime constraints before drawing conclusions.

The rendezvous is local to one gateway factory instance. A Bunny request may
execute at an edge PoP; regional/PoP routing provides no global connector
registry or guarantee that a later probe reaches the same instance. The actual
mapping from factory instances to Bunny runtime isolates remains unverified.
Cross-isolate rendezvous is unresolved and outside this probe.

Public WebSockets, Server-Sent Events, and raw TCP/UDP are absent from this
milestone. Do not describe the experiment as a general tunnel, reverse proxy, or
network gateway.

## Protocol boundary

The [protocol notes](protocol/README.md) are the behavioral reference for
frames, messages, authentication roles, and expected outcomes. Share only
behavioral vectors with Bunny Hole. Credential audience, enrollment, routes, and
release processes must remain separate; this experiment does not define or
authorize those systems.

## Bunny references

- [WebSockets](https://bunny.net/docs/scripting/websockets)
- [Runtime and `waitUntil`](https://bunny.net/docs/scripting/runtime)
- [Execution limits](https://bunny.net/docs/scripting/limits)
- [Edge Scripting regions and PoPs](https://bunny.net/docs/scripting/regions)
