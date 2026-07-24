export interface ReleaseNote {
  title: string;
  text: string;
}

export interface ReleaseCommit {
  hash?: string | null;
  subject?: string | null;
  body?: string | null;
  footer?: string | null;
  notes?: ReleaseNote[];
}

const TUNNEL_FEATURE_COMMIT = "ae87b1fc9bf3c81d1afded0b938a59c5a296655e";
const RELEASE_AND_TUNNEL_SECURITY_COMMIT =
  "01c5f0370159f5e5ed32bd5b351350efe0d4c31d";
const MIXED_RUNTIME_SECURITY_COMMIT =
  "e4913aee4b1b4249f6ad5022a5c2397689655b31";
const OBSOLETE_TUNNEL_BREAKING_CHANGE =
  "The tunnel body limit is now capped at 10 MiB.";

export function curateReleaseCommit<T extends ReleaseCommit>(
  commit: T,
): Partial<T> | null;
export function curateReleaseCommit(
  commit: ReleaseCommit,
): Partial<ReleaseCommit> | null {
  if (commit.hash === TUNNEL_FEATURE_COMMIT) {
    return null;
  }

  if (commit.hash === RELEASE_AND_TUNNEL_SECURITY_COMMIT) {
    return {
      ...commit,
      subject: "harden release security",
    };
  }

  if (commit.hash === MIXED_RUNTIME_SECURITY_COMMIT) {
    return {
      ...commit,
      body: removeObsoleteTunnelChange(commit.body),
      footer: removeObsoleteTunnelChange(commit.footer),
      notes: commit.notes?.map((note) => ({
        ...note,
        text: removeObsoleteTunnelChange(note.text) ?? "",
      })),
    };
  }

  return commit;
}

export function curateReleaseWriterTransform<
  Commit extends ReleaseCommit,
  Context,
  Result,
>(
  transform: (commit: Commit, context: Context) => Result,
): (commit: Commit, context: Context) => Result | undefined {
  return (commit, context) => {
    const curated = curateReleaseCommit(commit);
    if (curated === null) {
      return undefined;
    }
    return transform({ ...commit, ...curated }, context);
  };
}

function removeObsoleteTunnelChange(value: string | null | undefined) {
  if (value == null) {
    return value;
  }

  return value
    .split("\n")
    .filter((line) => line.trim() !== OBSOLETE_TUNNEL_BREAKING_CHANGE)
    .join("\n")
    .trimEnd();
}
