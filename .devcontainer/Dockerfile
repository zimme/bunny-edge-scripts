ARG DENO_VERSION=2.9.3
FROM denoland/deno:${DENO_VERSION}@sha256:6288db6be1c26473bb9d1843f906d9a219c0dda57fd85de4aac90296951cf6ef AS deno

FROM mcr.microsoft.com/devcontainers/base@sha256:c67a3686b2bf97247c8437d8af55adea99456a61f6d4088c3a01a7c38b1e049d

COPY --from=deno /usr/bin/deno /usr/local/bin/deno

ENV DENO_DIR=/deno-dir \
    DENO_NO_PROMPT=1 \
    DENO_NO_UPDATE_CHECK=1

RUN mkdir -p /deno-dir && chown vscode:vscode /deno-dir
