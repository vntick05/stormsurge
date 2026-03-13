#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -lt 2 ] || [ "$#" -gt 3 ]; then
  echo "usage: $0 <project_id> <display_name> [folder_path]" >&2
  exit 1
fi

project_id="$1"
display_name="$2"
folder_path="${3:-/home/admin/stormsurge/data/rfps/$project_id}"
project_dir="/home/admin/stormsurge/data/rfps/$project_id"
manifest_path="$project_dir/project.json"
summary_path="/home/admin/stormsurge/outputs/${project_id}-rfp-package-summary.md"
container_folder_path="$folder_path"

if [ ! -d "$folder_path" ]; then
  echo "folder not found: $folder_path" >&2
  exit 1
fi

case "$folder_path" in
  /home/admin/stormsurge/data/*)
    container_folder_path="/opt/perfect-rfp/data/${folder_path#/home/admin/stormsurge/data/}"
    ;;
esac

mkdir -p "$project_dir"

python3 - <<PY
import json
from pathlib import Path

manifest_path = Path("$manifest_path")
project_id = "$project_id"
display_name = "$display_name"
manifest = {
    "project_id": project_id,
    "display_name": display_name,
    "model_id": display_name,
    "description": f"Project-scoped RFP chat target for {display_name}.",
}
manifest_path.write_text(json.dumps(manifest, indent=2) + "\n")
print(manifest_path)
PY

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
print(urllib.request.urlopen(request, timeout=1800).read().decode())
' <<JSON
{"project_id":"$project_id","folder_path":"$container_folder_path","skip_existing":true}
JSON

python3 - <<PY
from pathlib import Path
import urllib.request

summary_path = Path("$summary_path")
url = "http://127.0.0.1:8192/v1/projects/$project_id/analyses/rfp-package-summary.md"
with urllib.request.urlopen(url, timeout=600) as response:
    summary_path.write_bytes(response.read())
print(summary_path)
PY

echo "project bootstrapped: $project_id"
echo "openwebui model name: $display_name"
