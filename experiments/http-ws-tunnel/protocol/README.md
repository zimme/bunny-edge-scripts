# Rendezvous Probe Protocol v1 (Experiment)

This document specifies only the local, isolate-scoped probe exchange. It does
not define a production tunnel, global routing, credential enrollment, or public
service API.

## Roles and scope

- **Connector:** trusted local probe process that authenticates with
  `TUNNEL_PROBE_CONNECTOR_TOKEN` and holds one WebSocket per isolate.
- **Viewer:** caller of `GET /__probe`, authenticated independently with
  `TUNNEL_PROBE_VIEWER_TOKEN`.
- **Gateway:** dependency-free protocol handler with an injected upgrade
  adapter. The Bunny entrypoint supplies the platform adapter; a local
  `Deno.serve` adapter is permitted only over loopback HTTP in an explicit local
  harness.

The gateway accepts exactly the configured `TUNNEL_PROBE_HOSTNAME`. The only
hostname exception is the explicit local harness at `http://127.0.0.1`;
otherwise requests require HTTPS and the configured host. Connector and viewer
bearer credentials are separate values, each 32-256 URL-safe characters (`A-Z`,
`a-z`, `0-9`, `_`, `-`), and must not be equal. Authorization is exactly
`Bearer <token>` with case-sensitive `Bearer`; query credentials are rejected.
Supply variables through a user-owned private environment, never as source or
command-line secret literals. Tests generate ephemeral credentials and require
no human credential step.

## Endpoints

### `GET /__probe/connect`

Requires the connector credential and a WebSocket upgrade requesting the
`bunny-rendezvous-v1` subprotocol. A successful connection becomes the active
connector for the handling gateway instance. At most one is active: a new
registration replaces the prior connector, closes it, and fails probes pending
on that old session.

Immediately after registration, the server sends a UTF-8 JSON text message:

```json
{
  "type": "registered",
  "version": 1,
  "isolateId": "<opaque>",
  "sessionId": "<opaque>",
  "hostname": "<configured-hostname>"
}
```

`isolateId` and `sessionId` are opaque diagnostic identifiers, not routing
coordinates or credentials. Each `createProbeGateway` factory instance creates
one `isolateId` and models one isolate for local tests; its mapping to an actual
Bunny runtime isolate and lifetime is unverified. The server rotates the session
after five minutes. The connector sends exactly `{"type":"heartbeat"}` every ten
seconds. The server responds with exactly `{"type":"heartbeat-ack"}`. A
connection idle for thirty seconds is unhealthy and is closed.

### `GET /__probe`

Requires the viewer credential and the exact configured hostname. If this
gateway instance has no active connector, return `503 Service Unavailable`; do
not claim that another instance was checked. Limit the instance to eight pending
probes; further probes return HTTP `429`. Each probe has a three-second
deadline; a timeout returns HTTP `504`. Connector replacement, disconnect,
malformed response, or challenge mismatch fails that probe; none may be reported
as a successful echo. A valid frame for an unknown request ID, including a
duplicate or late echo for a timed-out or cancelled probe, is intentionally
ignored. A malformed frame or altered frame for a still-pending challenge closes
the connector with WebSocket close code `1008`.

The response carries diagnostic headers when available:

- `x-probe-request-id`
- `x-probe-session-id`
- `x-probe-isolate-id`

On a valid challenge echo, the successful response body is exactly the 32 random
payload bytes. It is not an HTTP response from a local origin and does not proxy
arbitrary request methods, headers, or bodies.

## Binary challenge

The server generates 32 cryptographically random payload bytes and prefixes them
with a canonical ASCII UUID. The wire frame is exactly 68 bytes:

| Offset |   Length | Value                                            |
| ------ | -------: | ------------------------------------------------ |
| 0      | 36 bytes | ASCII UUID text (`8-4-4-4-12`, hyphens included) |
| 36     | 32 bytes | Random payload                                   |

The entire 68-byte frame is sent as one binary WebSocket message. The UUID is an
opaque request identifier. The connector must echo the exact binary frame
unchanged as one binary message. The server validates both the identifier and
the 32-byte payload against the outstanding challenge, then returns only the
payload bytes to the viewer. Unknown or duplicate valid frames are ignored;
malformed frames or altered bytes matching a pending challenge close the
connector with code `1008`. A connector must not interpret the payload as an
instruction or send it to any origin.

## Message exchange

```text
Viewer                   Gateway (one isolate)                   Connector
  | GET /__probe + viewer bearer |                                  |
  |----------------------------->|                                  |
  |                              | 68-byte binary challenge frame  |
  |                              |--------------------------------->|
  |                              |     same 68-byte binary frame   |
  |                              |<---------------------------------|
  | 200 + 32 payload bytes       |                                  |
  |<-----------------------------|                                  |
```

The connector sends exactly `{"type":"heartbeat"}` every ten seconds while
connected. The server responds with exactly `{"type":"heartbeat-ack"}`. These
messages have no timestamp, sequence, or routing fields. Control messages are
limited to 512 UTF-8 bytes. Before sending, the gateway requires the socket's
buffered amount to be no greater than 4 KiB minus one 68-byte probe frame;
otherwise new probe work is rejected with HTTP `429`, or the connector is closed
with code `1008` if a heartbeat cannot be sent. Valid late echoes for timed-out
or cancelled probes are ignored.

## Failure and non-goals

No registered connector in the handling gateway instance yields 503. The gateway
must not synthesize a remote connector, broadcast to unknown isolates, or infer
that region affinity implies isolate affinity. Global rendezvous remains
unresolved.

The implementation uses one active connector per gateway factory instance,
replacing the prior session, with an eight-probe concurrency cap, three-second
probe timeout, ten-second heartbeat, thirty-second idle bound, and five-minute
rotation. The factory instance models an isolate in local tests; actual runtime
mapping and platform lifetime/frame/connection quotas remain unverified. Public
WebSockets, Server-Sent Events, and raw TCP/UDP are not part of this protocol
milestone.

Behavioral vectors may be shared with Bunny Hole. Do not share credentials or
conflate credential audience, enrollment, routes, or release procedures; those
remain separate. This protocol does not provision credentials or authorize cloud
access.
