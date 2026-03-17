#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="/home/admin/stormsurge"

mkdir -p \
  "${ROOT_DIR}/model-cache/document-service" \
  "${ROOT_DIR}/model-cache/normalization-service" \
  "${ROOT_DIR}/model-cache/retrieval-service" \
  "${ROOT_DIR}/model-cache/pws-structuring-service"

cd "${ROOT_DIR}"

docker compose --env-file .env -f compose.yaml up -d \
  document-service normalization-service retrieval-service pws-structuring-service

docker exec stormsurge-document-service python -c \
  "from app import get_fast_converter, get_ocr_converter; get_fast_converter(); get_ocr_converter(); print('document-service-docling-ready')"

docker exec stormsurge-normalization-service python -c \
  "from app import get_converter; get_converter(); print('normalization-docling-ready')"

docker exec stormsurge-retrieval-service python -c \
  "from fastembed import TextEmbedding; m=TextEmbedding(model_name='BAAI/bge-small-en-v1.5'); list(m.embed(['warmup'])); print('retrieval-bge-ready')"

docker exec stormsurge-pws-structuring-service python -c \
  "from docling.document_converter import DocumentConverter; DocumentConverter(); print('pws-docling-ready')"
