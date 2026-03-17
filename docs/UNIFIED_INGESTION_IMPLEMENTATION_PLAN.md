# Unified Ingestion Implementation Plan

This plan turns `docs/UNIFIED_INGESTION_ARCHITECTURE.md` into an execution sequence for the current StormSurge repo.

## Target End State

- one upload path for all documents
- one canonical structured artifact for all downstream services
- one AI knowledge artifact derived from the canonical structured artifact
- deterministic PWS/SOW enrichment layered on top of the canonical artifact
- one UI upload, multiple views over the same ingested document

## Phase 0: Freeze the Direction

### Decisions

- `structured_document_v1` is the canonical artifact for all documents
- `knowledge_index_v1` is the canonical AI retrieval artifact
- `normalization-service` becomes the producer of `structured_document_v1`
- `retrieval-service` becomes the producer of `knowledge_index_v1`
- `pws-structuring-service` becomes a consumer/projection service over canonical artifacts

### Immediate rule changes

- no new upload-only PWS endpoints
- no new frontend-only hierarchy shaping as source of truth
- all new import work must map back to the canonical artifact model

## Phase 1: Canonical Artifact Foundations

### Repo areas

- `services/normalization-service`
- `services/pws-structuring-service`

### Ownership in this phase

- first official producer of `structured_document_v1`:
  - `services/pws-structuring-service`
  - specifically the current merged import flow
- target long-term producer:
  - `services/normalization-service`
- temporary legacy consumers:
  - v4 outline import path
  - current PWS merged import compatibility payload
  - any existing UI code still expecting `root_sections`, `alignment_debug`, or `unplaced_artifacts`

### Work

1. Define shared schema helpers for `structured_document_v1`
2. Define:
   - document metadata model
   - cleaned text model
   - hierarchy model
   - table/image object model
   - provenance/confidence model
   - enrichment model
3. Add artifact builders that can wrap current normalization/PWS outputs without changing all services at once
4. Add compatibility endpoints or response fields so existing PWS flows can emit canonical artifacts immediately

### Exit criteria

- current merged PWS import returns a valid `structured_document_v1` payload or embedded field
- tests validate artifact shape

## Phase 2: Deterministic PWS Enrichment Consolidation

### Repo areas

- `services/pws-structuring-service/import_cleaner.py`
- `services/pws-structuring-service/outline_view.py`
- `services/pws-structuring-service/rich_import.py`
- `services/normalization-service`

### Work

1. Move deterministic PWS cleanup and heading logic into a versioned enrichment module
2. Make enrichment output explicit:
   - `pws_clean_vX`
   - `pws_headings_vX`
   - `pws_alignment_vX`
3. Emit:
   - hierarchy quality
   - alignment decisions
   - requirement-related flags
   - unplaced objects

### Exit criteria

- PWS/SOW section extraction is represented as `enrichments.pws` inside `structured_document_v1`
- no frontend transform is needed to invent hierarchy

## Phase 3: Retrieval Refactor

### Repo areas

- `services/retrieval-service`

### Work

1. Change retrieval ingestion to consume `structured_document_v1`
2. Implement chunk strategies:
   - `section_aware`
   - `mixed`
   - `page_window`
3. Produce `knowledge_index_v1`
4. Preserve links from chunks back to:
   - section ids
   - page provenance
   - table/image ids where relevant

### Exit criteria

- all uploaded documents are chunked/indexed for AI retrieval
- strong hierarchy yields section-aware chunks
- weak hierarchy still yields fallback retrieval chunks

## Phase 4: Single Upload Contract

### Repo areas

- `services/document-service`
- `services/normalization-service`
- `services/retrieval-service`
- `ui/stormsurge-studio-v4`

### Work

1. Add one upload endpoint:
   - `POST /v1/documents/upload`
2. Trigger:
   - raw storage
   - structured artifact generation
   - retrieval artifact generation
3. Return:
   - `document_id`
   - processing status
   - artifact readiness flags

### Exit criteria

- v4 can upload once and then load multiple views by `document_id`

## Phase 5: UI Simplification

### Repo areas

- `ui/stormsurge-studio-v4`

### Work

1. Replace multiple import concepts with one upload action
2. Add views:
   - outline
   - requirements
   - tables/images
   - chat/retrieval
3. Show:
   - section hierarchy from canonical artifact
   - object placement and unplaced artifacts
   - retrieval state and document tags

### Exit criteria

- no `Outline` vs `Rich` upload choice in primary UX
- one document, many views

## Phase 6: Endpoint Deprecation

### Deprecate as primary ingestion paths

- `/v1/pws/stage1/upload`
- `/v1/pws/stage1/from-artifact`
- `/v1/pws/outline/upload`
- `/v1/pws/rich-import/upload`
- `/v1/pws/merged-import/upload`

### Keep temporarily as compatibility wrappers

- wrappers may call canonical artifact builders internally
- wrappers should not define new architecture

## Recommended First Implementation Slice

The first slice should be low-risk and immediately useful:

1. add canonical structured artifact builders
2. make current merged import emit `structured_document_v1`
3. keep existing response fields for compatibility
4. add tests validating:
   - hierarchy
   - tables/images
   - provenance/confidence
   - PWS enrichment metadata

This gives the repo a real canonical contract without forcing a same-turn full rewrite of normalization and retrieval.
