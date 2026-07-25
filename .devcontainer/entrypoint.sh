#!/bin/sh
set -eu

workspace=/workspaces/bunny-edge-scripts
ready_file=/tmp/bunny-edge-scripts-ready

if [ "$(id -u)" = 0 ]; then
  workspace_uid=$(stat -c %u "$workspace")
  workspace_gid=$(stat -c %g "$workspace")

  # Linux bind mounts retain the host checkout owner. Match it before writing.
  if [ "$workspace_uid" != 0 ]; then
    if [ "$workspace_gid" != "$(id -g vscode)" ]; then
      groupmod --non-unique --gid "$workspace_gid" vscode
    fi
    if [ "$workspace_uid" != "$(id -u vscode)" ]; then
      usermod --non-unique --uid "$workspace_uid" vscode
    fi
    chown -R vscode:vscode /deno-dir
  fi

  exec sudo --preserve-env --set-home --user vscode -- "$0" "$@"
fi

rm -f "$ready_file"
cd "$workspace"
deno task setup
touch "$ready_file"

exec "$@"
