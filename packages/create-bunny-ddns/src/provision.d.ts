export interface PrivateTerminalProvisionOptions {
  scriptName: string;
  ddnsUsername: string;
  allowedHosts: string;
  allowedZones: string;
}

export interface PrivateTerminalProvisionResult {
  scriptId: number;
  hostname: string | null;
}

export interface PrivateTerminalIO {
  isTerminal: boolean;
  readAcknowledgement(prompt: string): string | null;
  readSecret(prompt: string): Promise<string>;
  write(message: string): void;
}

export declare function provisionFromPrivateTerminal(
  options: PrivateTerminalProvisionOptions,
  io?: PrivateTerminalIO,
  fetcher?: typeof fetch,
): Promise<PrivateTerminalProvisionResult>;
