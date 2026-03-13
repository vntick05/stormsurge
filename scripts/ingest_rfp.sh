#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -lt 1 ] || [ "$#" -gt 2 ]; then
  echo "usage: $0 <rfp_id> [folder_path]" >&2
  exit 1
fi

rfp_id="$1"
folder_path="${2:-}"

payload=$(printf '{"project_id":"%s","skip_existing":true' "$rfp_id")
if [ -n "$folder_path" ]; then
  payload=$(printf '%s,"folder_path":"%s"}' "$payload" "$folder_path")
else
  payload="${payload}}"
fi

docker exec -i stormsurge-retrieval-service python -c '
import json
import sys
import urllib.request

payload = json.loads(sys.stdin.read())
request = urllib.request.Request(
    "http://127.0.0.1:8481/v1/seed/setup",
    data=json.dumps(payload).encode(),
    headers={"Content-Type": "application/json"},
)
print(urllib.request.urlopen(request, timeout=600).read().decode())
' <<<"$payload"
