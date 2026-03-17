#!/usr/bin/env bash
set -euo pipefail

SCRIPT="/home/admin/stormsurge/scripts/start_stormsurge_stack.sh"

printf '\033]0;%s\007' 'StormSurge Stack Startup'

"${SCRIPT}"
status=$?

printf '\n'
if [[ ${status} -eq 0 ]]; then
  printf 'StormSurge stack launcher finished successfully.\n'
else
  printf 'StormSurge stack launcher failed with exit code %s.\n' "${status}"
fi
printf 'Press Enter to close this window...'
read -r _

exit "${status}"
