#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -lt 2 ] || [ "$#" -gt 3 ]; then
  echo "usage: $0 <project_id> <pws_file> [output_json]" >&2
  exit 1
fi

project_id="$1"
pws_file="$2"
output_json="${3:-}"
container_name="stormsurge-normalization-service"

if [ ! -f "$pws_file" ]; then
  echo "file not found: $pws_file" >&2
  exit 1
fi

filename="$(basename "$pws_file")"
container_input="/tmp/${filename}"
container_output="/tmp/${project_id}-$(date +%s)-pws-extract.json"

docker cp "$pws_file" "${container_name}:${container_input}"

docker exec "$container_name" python -c '
import json
import pathlib
import sys

import app

project_id = sys.argv[1]
filename = sys.argv[2]
input_path = pathlib.Path(sys.argv[3])
output_path = pathlib.Path(sys.argv[4])

payload = app.extract_pws_payload(
    filename=filename,
    content=input_path.read_bytes(),
    project_id=project_id,
)
output_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
print(output_path)
' "$project_id" "$filename" "$container_input" "$container_output" >/tmp/stormsurge-extract-path.txt

resolved_container_output="$(cat /tmp/stormsurge-extract-path.txt)"
rm -f /tmp/stormsurge-extract-path.txt

if [ -n "$output_json" ]; then
  mkdir -p "$(dirname "$output_json")"
  docker cp "${container_name}:${resolved_container_output}" "$output_json"
  docker exec "$container_name" rm -f "$container_input" "$resolved_container_output" >/dev/null
  echo "$output_json"
else
  docker exec "$container_name" cat "$resolved_container_output"
  docker exec "$container_name" rm -f "$container_input" "$resolved_container_output" >/dev/null
fi
