#!/usr/bin/env bash
set -euo pipefail

SCRIPT="/home/admin/stormsurge/scripts/start_storm_companion.sh"

printf '\033]0;%s\007' 'StormSurge Startup'

"${SCRIPT}"
status=$?

printf '\n'
if [[ ${status} -eq 0 ]]; then
  printf 'StormSurge launcher finished successfully.\n'
else
  printf 'StormSurge launcher failed with exit code %s.\n' "${status}"
fi
printf 'Press Enter to close this window...'
read -r _

exit "${status}"
