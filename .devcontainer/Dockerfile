ARG DENO_VERSION=2.9.3
FROM denoland/deno:${DENO_VERSION}@sha256:6288db6be1c26473bb9d1843f906d9a219c0dda57fd85de4aac90296951cf6ef AS deno

FROM mcr.microsoft.com/devcontainers/base@sha256:1a00517e89d3075f8c9dc8d9911404de0ff8991a4d71c62068573e9b016a89da

COPY --from=deno /usr/bin/deno /usr/local/bin/deno

ENV DENO_DIR=/deno-dir \
    DENO_NO_PROMPT=1 \
    DENO_NO_UPDATE_CHECK=1

RUN mkdir -p /deno-dir && chown vscode:vscode /deno-dir
