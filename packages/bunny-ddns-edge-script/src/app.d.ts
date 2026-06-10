/**
 * @typedef {typeof DNS_RECORD_TYPE_A | typeof DNS_RECORD_TYPE_AAAA} DdnsRecordType
 */
/**
 * @typedef {(input: string | URL | Request, init?: RequestInit) => Promise<Response>} Fetcher
 */
/**
 * @typedef {object} BunnyDnsRecord
 * @property {number} Id
 * @property {number} Type
 * @property {number | null} [Ttl]
 * @property {string | null} [Value]
 * @property {string | null} [Name]
 * @property {number | null} [Weight]
 * @property {number | null} [Priority]
 * @property {number | null} [Port]
 * @property {number | null} [Flags]
 * @property {string | null} [Tag]
 * @property {number | null} [PullZoneId]
 * @property {number | null} [ScriptId]
 * @property {boolean | null} [Accelerated]
 * @property {number | null} [AcceleratedPullZoneId]
 * @property {number | null} [MonitorType]
 * @property {number | null} [GeolocationLatitude]
 * @property {number | null} [GeolocationLongitude]
 * @property {Array<{ Name: string, Value: string }> | null} [EnviromentalVariables]
 * @property {string | null} [LatencyZone]
 * @property {number | null} [SmartRoutingType]
 * @property {boolean | null} [Disabled]
 * @property {string | null} [Comment]
 * @property {boolean | null} [AutoSslIssuance]
 */
/**
 * @typedef {object} BunnyDnsZone
 * @property {number} Id
 * @property {string} Domain
 * @property {BunnyDnsRecord[] | null} [Records]
 */
/**
 * @typedef {"reject" | "update-all"} MultiRecordMode
 */
/**
 * @typedef {object} RuntimeConfig
 * @property {string} apiBaseUrl
 * @property {string} bunnyApiKey
 * @property {string[]} sharedSecrets
 * @property {string} [username]
 * @property {string[]} allowedHosts
 * @property {string[]} deniedHosts
 * @property {string[]} allowedZones
 * @property {string[]} deniedZones
 * @property {boolean} autoCreate
 * @property {number} defaultTtl
 * @property {boolean} allowInsecureHttp
 * @property {MultiRecordMode} multiRecordMode
 * @property {number} maxHostnames
 * @property {string} managedComment
 */
/**
 * @typedef {object} EnvReader
 * @property {(name: string) => string | undefined} get
 */
/**
 * @typedef {object} HandlerOptions
 * @property {RuntimeConfig} config
 * @property {Fetcher} [fetcher]
 */
/**
 * @typedef {object} BasicCredentials
 * @property {string} username
 * @property {string} password
 */
/**
 * @typedef {object} RequestedAddress
 * @property {string} ip
 * @property {DdnsRecordType} type
 */
/** @typedef {"good" | "nochg" | "nohost" | "notfqdn" | "badip" | "badauth" | "badagent" | "numhost" | "!yours" | "dnserr" | "911"} DdnsCode */
/**
 * @typedef {object} DdnsLine
 * @property {DdnsCode} code
 * @property {string} [detail]
 */
/** @typedef {{ kind: "none", address: RequestedAddress } | { kind: "create", address: RequestedAddress, name: string } | { kind: "update", address: RequestedAddress, records: BunnyDnsRecord[] }} PlannedAction */
/**
 * @typedef {object} HostPlan
 * @property {string} hostname
 * @property {BunnyDnsZone} zone
 * @property {PlannedAction[]} actions
 */
/**
 * @typedef {object} BunnyListResponse
 * @property {BunnyDnsZone[] | null} [Items]
 * @property {number} [CurrentPage]
 * @property {number} [TotalItems]
 * @property {boolean} [HasMoreItems]
 */
/**
 * @typedef {{ kind: "ok", values: string[] } | { kind: "error", code: DdnsCode }} ParsedHostnames
 */
/**
 * @typedef {{ kind: "ok", values: RequestedAddress[] } | { kind: "error", code: DdnsCode }} ParsedRequestedAddresses
 */
/**
 * @typedef {{ kind: "ok", value: HostPlan } | { kind: "error", line: DdnsLine }} PlannedHostnameUpdate
 */
/**
 * @typedef {object} ZoneCandidate
 * @property {BunnyDnsZone} zone
 * @property {string} domain
 */
/**
 * @param {HandlerOptions} options
 * @returns {(request: Request) => Promise<Response>}
 */
export function createHandler(
  options: HandlerOptions,
): (request: Request) => Promise<Response>;
/**
 * @param {EnvReader} env
 * @returns {RuntimeConfig}
 */
export function readConfigFromEnv(env: EnvReader): RuntimeConfig;
/**
 * @param {string} hostname
 * @returns {string | undefined}
 */
export function normalizeHostname(hostname: string): string | undefined;
/**
 * @param {string} ip
 * @returns {RequestedAddress | undefined}
 */
export function classifyIpAddress(ip: string): RequestedAddress | undefined;
/**
 * @param {string} hostname
 * @param {BunnyDnsZone} zone
 * @param {RuntimeConfig} config
 * @returns {boolean}
 */
export function isHostnameAllowed(
  hostname: string,
  zone: BunnyDnsZone,
  config: RuntimeConfig,
): boolean;
export const DNS_RECORD_TYPE_A: 0;
export const DNS_RECORD_TYPE_AAAA: 1;
/**
 * @typedef {typeof DNS_RECORD_TYPE_A | typeof DNS_RECORD_TYPE_AAAA} DdnsRecordType
 */
/**
 * @typedef {(input: string | URL | Request, init?: RequestInit) => Promise<Response>} Fetcher
 */
/**
 * @typedef {object} BunnyDnsRecord
 * @property {number} Id
 * @property {number} Type
 * @property {number | null} [Ttl]
 * @property {string | null} [Value]
 * @property {string | null} [Name]
 * @property {number | null} [Weight]
 * @property {number | null} [Priority]
 * @property {number | null} [Port]
 * @property {number | null} [Flags]
 * @property {string | null} [Tag]
 * @property {number | null} [PullZoneId]
 * @property {number | null} [ScriptId]
 * @property {boolean | null} [Accelerated]
 * @property {number | null} [AcceleratedPullZoneId]
 * @property {number | null} [MonitorType]
 * @property {number | null} [GeolocationLatitude]
 * @property {number | null} [GeolocationLongitude]
 * @property {Array<{ Name: string, Value: string }> | null} [EnviromentalVariables]
 * @property {string | null} [LatencyZone]
 * @property {number | null} [SmartRoutingType]
 * @property {boolean | null} [Disabled]
 * @property {string | null} [Comment]
 * @property {boolean | null} [AutoSslIssuance]
 */
/**
 * @typedef {object} BunnyDnsZone
 * @property {number} Id
 * @property {string} Domain
 * @property {BunnyDnsRecord[] | null} [Records]
 */
/**
 * @typedef {"reject" | "update-all"} MultiRecordMode
 */
/**
 * @typedef {object} RuntimeConfig
 * @property {string} apiBaseUrl
 * @property {string} bunnyApiKey
 * @property {string[]} sharedSecrets
 * @property {string} [username]
 * @property {string[]} allowedHosts
 * @property {string[]} deniedHosts
 * @property {string[]} allowedZones
 * @property {string[]} deniedZones
 * @property {boolean} autoCreate
 * @property {number} defaultTtl
 * @property {boolean} allowInsecureHttp
 * @property {MultiRecordMode} multiRecordMode
 * @property {number} maxHostnames
 * @property {string} managedComment
 */
/**
 * @typedef {object} EnvReader
 * @property {(name: string) => string | undefined} get
 */
/**
 * @typedef {object} HandlerOptions
 * @property {RuntimeConfig} config
 * @property {Fetcher} [fetcher]
 */
/**
 * @typedef {object} BasicCredentials
 * @property {string} username
 * @property {string} password
 */
/**
 * @typedef {object} RequestedAddress
 * @property {string} ip
 * @property {DdnsRecordType} type
 */
/** @typedef {"good" | "nochg" | "nohost" | "notfqdn" | "badip" | "badauth" | "badagent" | "numhost" | "!yours" | "dnserr" | "911"} DdnsCode */
/**
 * @typedef {object} DdnsLine
 * @property {DdnsCode} code
 * @property {string} [detail]
 */
/** @typedef {{ kind: "none", address: RequestedAddress } | { kind: "create", address: RequestedAddress, name: string } | { kind: "update", address: RequestedAddress, records: BunnyDnsRecord[] }} PlannedAction */
/**
 * @typedef {object} HostPlan
 * @property {string} hostname
 * @property {BunnyDnsZone} zone
 * @property {PlannedAction[]} actions
 */
/**
 * @typedef {object} BunnyListResponse
 * @property {BunnyDnsZone[] | null} [Items]
 * @property {number} [CurrentPage]
 * @property {number} [TotalItems]
 * @property {boolean} [HasMoreItems]
 */
/**
 * @typedef {{ kind: "ok", values: string[] } | { kind: "error", code: DdnsCode }} ParsedHostnames
 */
/**
 * @typedef {{ kind: "ok", values: RequestedAddress[] } | { kind: "error", code: DdnsCode }} ParsedRequestedAddresses
 */
/**
 * @typedef {{ kind: "ok", value: HostPlan } | { kind: "error", line: DdnsLine }} PlannedHostnameUpdate
 */
/**
 * @typedef {object} ZoneCandidate
 * @property {BunnyDnsZone} zone
 * @property {string} domain
 */
/**
 * @param {HandlerOptions} options
 * @returns {(request: Request) => Promise<Response>}
 */
export function createBunnyDdnsHandler(
  options: HandlerOptions,
): (request: Request) => Promise<Response>;
/**
 * @param {EnvReader} env
 * @returns {RuntimeConfig}
 */
export function readBunnyDdnsConfigFromEnv(env: EnvReader): RuntimeConfig;
export type DdnsRecordType =
  | typeof DNS_RECORD_TYPE_A
  | typeof DNS_RECORD_TYPE_AAAA;
export type Fetcher = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;
export type BunnyDnsRecord = {
  Id: number;
  Type: number;
  Ttl?: number | null | undefined;
  Value?: string | null | undefined;
  Name?: string | null | undefined;
  Weight?: number | null | undefined;
  Priority?: number | null | undefined;
  Port?: number | null | undefined;
  Flags?: number | null | undefined;
  Tag?: string | null | undefined;
  PullZoneId?: number | null | undefined;
  ScriptId?: number | null | undefined;
  Accelerated?: boolean | null | undefined;
  AcceleratedPullZoneId?: number | null | undefined;
  MonitorType?: number | null | undefined;
  GeolocationLatitude?: number | null | undefined;
  GeolocationLongitude?: number | null | undefined;
  EnviromentalVariables?:
    | {
      Name: string;
      Value: string;
    }[]
    | null
    | undefined;
  LatencyZone?: string | null | undefined;
  SmartRoutingType?: number | null | undefined;
  Disabled?: boolean | null | undefined;
  Comment?: string | null | undefined;
  AutoSslIssuance?: boolean | null | undefined;
};
export type BunnyDnsZone = {
  Id: number;
  Domain: string;
  Records?: BunnyDnsRecord[] | null | undefined;
};
export type MultiRecordMode = "reject" | "update-all";
export type RuntimeConfig = {
  apiBaseUrl: string;
  bunnyApiKey: string;
  sharedSecrets: string[];
  username?: string | undefined;
  allowedHosts: string[];
  deniedHosts: string[];
  allowedZones: string[];
  deniedZones: string[];
  autoCreate: boolean;
  defaultTtl: number;
  allowInsecureHttp: boolean;
  multiRecordMode: MultiRecordMode;
  maxHostnames: number;
  managedComment: string;
};
export type EnvReader = {
  get: (name: string) => string | undefined;
};
export type HandlerOptions = {
  config: RuntimeConfig;
  fetcher?: Fetcher | undefined;
};
export type BasicCredentials = {
  username: string;
  password: string;
};
export type RequestedAddress = {
  ip: string;
  type: DdnsRecordType;
};
export type DdnsCode =
  | "good"
  | "nochg"
  | "nohost"
  | "notfqdn"
  | "badip"
  | "badauth"
  | "badagent"
  | "numhost"
  | "!yours"
  | "dnserr"
  | "911";
export type DdnsLine = {
  code: DdnsCode;
  detail?: string | undefined;
};
export type PlannedAction = {
  kind: "none";
  address: RequestedAddress;
} | {
  kind: "create";
  address: RequestedAddress;
  name: string;
} | {
  kind: "update";
  address: RequestedAddress;
  records: BunnyDnsRecord[];
};
export type HostPlan = {
  hostname: string;
  zone: BunnyDnsZone;
  actions: PlannedAction[];
};
export type BunnyListResponse = {
  Items?: BunnyDnsZone[] | null | undefined;
  CurrentPage?: number | undefined;
  TotalItems?: number | undefined;
  HasMoreItems?: boolean | undefined;
};
export type ParsedHostnames = {
  kind: "ok";
  values: string[];
} | {
  kind: "error";
  code: DdnsCode;
};
export type ParsedRequestedAddresses = {
  kind: "ok";
  values: RequestedAddress[];
} | {
  kind: "error";
  code: DdnsCode;
};
export type PlannedHostnameUpdate = {
  kind: "ok";
  value: HostPlan;
} | {
  kind: "error";
  line: DdnsLine;
};
export type ZoneCandidate = {
  zone: BunnyDnsZone;
  domain: string;
};
