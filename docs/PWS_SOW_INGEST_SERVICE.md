# PWS/SOW Ingest Service

This service is separate from the general AI ingestion pipeline. Its first job is deterministic hierarchy extraction.

## Phase 1: Hierarchy First

Input:
- PWS / SOW / appendix source document

Output:
- `pws_hierarchy_v1`
  - `filename`
  - `source_kind`
  - `source_text`
  - `cleaned_markdown`
  - `root_sections`
  - `section_index`
  - `stats`

Extraction order:
1. `.docx` -> extract paragraph text from `word/document.xml`
2. `.txt` / `.md` -> use raw text
3. other types -> fallback to Docling markdown

Rules:
- hierarchy is extracted before any requirement, table, image, or retrieval enrichment
- numbered sections are authoritative when they can be detected
- lettered appendices are preserved
- front matter, TOC noise, classification banners, line numbers, and figure/table index noise are removed before outline construction

Current endpoint:
- `POST /v1/pws/hierarchy/upload`

This endpoint exists so the exact hierarchy extract can be inspected before downstream processing.
