#!/bin/sh
set -eu

workspace=/workspaces/bunny-edge-scripts
ready_file=/tmp/bunny-edge-scripts-ready

rm -f "$ready_file"
cd "$workspace"
deno task setup
touch "$ready_file"

exec "$@"
