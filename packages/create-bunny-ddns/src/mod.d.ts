export type PackageRegistry = "jsr" | "npm";
export type DeployMode = "bunny-git" | "github-action";

export interface ScaffoldOptions {
  projectName: string;
  directory: string;
  packageRegistry: PackageRegistry;
  packageVersion: string;
  deployMode: DeployMode;
  ddnsUsername: string;
  allowedHosts: string;
  allowedZones: string;
  force: boolean;
  dryRun: boolean;
}

export interface ScaffoldResult {
  directory: string;
  files: string[];
}

export declare function defaultOptions(): ScaffoldOptions;

export declare function scaffoldProject(
  options: ScaffoldOptions,
): Promise<ScaffoldResult>;
