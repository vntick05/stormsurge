# Unified Ingestion Architecture

This document defines the target architecture for StormSurge document ingestion.

The goal is to remove separate ingestion paths for:

- PWS/SOW outline workflows
- rich preservation workflows
- AI retrieval/chat workflows

Every uploaded document should go through one common ingestion pipeline and produce two linked outputs:

1. a canonical structured document artifact
2. an AI knowledge artifact

The PWS/SOW/outline problem remains critical. This design keeps PWS extraction as a deterministic enrichment stage on top of the common artifact model rather than weakening it into generic OCR text ingestion.

## Design Goals

- One upload path for all documents.
- One canonical document artifact for all downstream services.
- All documents become available for AI retrieval by default.
- PWS/SOW extraction remains deterministic, auditable, and high quality.
- Tables, images, hierarchy, and provenance stay available for both structured workflows and AI workflows.
- Graceful degradation when hierarchy quality is weak.
- One UI import entry point, multiple views over the same ingested artifact.

## Current Problems

- There are multiple competing PWS import paths: `stage1`, `outline`, `rich-import`, `merged-import`.
- The current stack splits responsibilities across:
  - document ingestion
  - normalization
  - PWS-specific extraction
  - frontend workspace shaping
- Retrieval is not driven from one canonical structured artifact for every document.
- PWS section extraction quality depends on special-case cleanup and parser logic that is not represented as a first-class enrichment contract.
- The UI exposes multiple import concepts instead of one upload followed by multiple views.

## Target Architecture

### Canonical Flow

1. Upload document once.
2. `document-service` stores the raw upload and creates a document record.
3. `normalization-service` produces a canonical structured document artifact for every document.
4. `normalization-service` runs document-type enrichment, including deterministic PWS/SOW enrichment when applicable.
5. `retrieval-service` consumes the canonical structured document artifact and produces the AI knowledge artifact for every document.
6. The UI reads the same canonical artifact family and presents multiple views:
   - outline
   - requirements
   - tables/images
   - chat/retrieval

### Common Principle

The canonical structured document artifact is the source of truth for:

- cleaned text
- hierarchy
- tables
- images
- provenance
- confidence
- document typing
- PWS/SOW section enrichment

The AI knowledge artifact is always derived from that canonical artifact, never from a separate PWS-only or chat-only ingestion path.

## Canonical Artifacts

### 1. Canonical Structured Document Artifact

Suggested schema name:

- `structured_document_v1`

Suggested top-level shape:

```json
{
  "artifact_type": "structured_document_v1",
  "document_id": "doc_123",
  "source": {
    "filename": "example.docx",
    "mime_type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "sha256": "..."
  },
  "metadata": {
    "document_type": "pws_sow",
    "document_type_confidence": 0.94,
    "page_count": 118,
    "ingested_at": "2026-03-17T12:00:00Z"
  },
  "cleaned_text": {
    "full_text": "...",
    "cleaning_profile": "default_docling_plus_rules_v1"
  },
  "hierarchy": {
    "quality": "strong",
    "confidence": 0.91,
    "sections": []
  },
  "objects": {
    "tables": [],
    "images": []
  },
  "blocks": [],
  "enrichments": {
    "pws": {
      "applied": true,
      "confidence": 0.93,
      "requirements_detected": true,
      "section_alignment_debug": []
    }
  },
  "provenance": {
    "parser": "docling",
    "parser_version": "x.y.z",
    "source_pages": []
  }
}
```

Required substructures:

- `metadata`
  - filename
  - mime type
  - checksum
  - page count
  - document type tags
  - ingestion timestamp
- `cleaned_text`
  - normalized full text
  - cleaning profile id
  - line-number/banner removal summary
- `hierarchy`
  - validated sections if available
  - hierarchy quality: `strong`, `partial`, `weak`, `none`
  - confidence score
- `objects.tables`
  - table id
  - row/cell content
  - page/order provenance
  - attachment target if resolved
  - confidence
- `objects.images`
  - image id
  - caption
  - page/order provenance
  - attachment target if resolved
  - confidence
- `blocks`
  - normalized ordered block stream
  - heading/text/table/image blocks
  - document order
  - page provenance
- `enrichments.pws`
  - PWS-specific deterministic outputs
  - section normalization
  - requirement indicators
  - attachment decisions
  - debug decisions

### 2. AI Knowledge Artifact

Suggested schema name:

- `knowledge_index_v1`

Suggested top-level shape:

```json
{
  "artifact_type": "knowledge_index_v1",
  "document_id": "doc_123",
  "structured_document_ref": "structured_document_v1:doc_123",
  "chunking": {
    "mode": "section_aware",
    "fallback_used": false
  },
  "chunks": [],
  "embeddings": {
    "provider": "fastembed",
    "model": "BAAI/bge-small-en-v1.5"
  },
  "retrieval_metadata": {
    "document_type_tags": ["pws_sow"],
    "requirement_related": true
  }
}
```

Required chunk fields:

- `chunk_id`
- `document_id`
- `text`
- `page_start`
- `page_end`
- `section_id` if known
- `section_number` if known
- `section_title` if known
- `chunk_type`
  - `section_text`
  - `paragraph`
  - `table`
  - `image_caption`
  - `page_window`
- `document_type_tags`
- `requirement_related`
- `confidence`

## Hierarchy and Degradation Rules

The system must always try to build strong hierarchy, but never fail ingestion when hierarchy quality is poor.

### Strong Hierarchy

Use section-aware chunking when:

- numbered headings are validated
- heading order is coherent
- front matter is stripped confidently
- line-number and OCR noise cleanup succeeds

PWS/SOW files should aim for this path by default.

### Partial Hierarchy

Use mixed chunking when:

- some sections are validated
- some later blocks cannot be attached confidently

In this case:

- keep the validated section tree
- attach unplaced tables/images separately
- chunk known sections by section
- chunk ambiguous text by page/order windows

### Weak or No Hierarchy

Do not block ingestion.

Fallback to:

- page-level or text-window chunks
- block-order chunks
- table/image objects without strong section linkage

This keeps every upload usable for AI retrieval even when structured extraction is poor.

## PWS/SOW Enrichment

PWS/SOW enrichment is a deterministic specialization on the canonical artifact, not a separate ingestion path.

### PWS Enrichment Responsibilities

- identify likely PWS/SOW documents
- apply deterministic cleanup:
  - line number removal
  - TOC removal
  - classification banner cleanup
  - heading normalization
  - heading validation
- build authoritative section hierarchy
- classify requirement-like sections
- align tables and images to sections with deterministic heuristics
- emit confidence and debug reasons

### Important Non-Negotiable Rule

The PWS hierarchy builder is the authoritative section extractor when the document is classified as PWS/SOW.

That means:

- do not rely on LLMs for primary section extraction
- do not allow frontend-only transforms to become the source of truth
- keep the heading normalization and parser-hardening rules server-side and versioned

### Suggested PWS Enrichment Output

```json
{
  "applied": true,
  "document_subtype": "sow",
  "heading_profile": "pws_heading_rules_v2",
  "hierarchy_quality": "strong",
  "requirements_detected": true,
  "sections": [],
  "alignment_debug": [],
  "flags": {
    "line_numbers_removed": true,
    "toc_removed": true,
    "classification_banners_removed": true
  }
}
```

## Service Responsibility Changes

### document-service

Keep:

- raw upload handling
- document record creation
- storage of source binaries and source metadata

Change:

- emit a canonical ingestion job for every upload
- stop treating PWS workflows as a separate document class at ingestion time

### normalization-service

This should become the producer of the canonical structured artifact for all documents.

Keep:

- normalization logic
- parsing helpers
- document-type-specific cleanup utilities

Expand:

- create `structured_document_v1`
- store normalized blocks, cleaned text, objects, provenance, and hierarchy quality
- run deterministic PWS/SOW enrichment as a plugin/enrichment stage
- expose one canonical artifact fetch endpoint

### retrieval-service

Change fundamentally:

- consume canonical structured artifacts instead of ad hoc parsed text paths

Responsibilities:

- choose chunking strategy from hierarchy quality
- create `knowledge_index_v1`
- store embeddings and retrieval metadata
- preserve links back to:
  - section ids
  - table ids
  - image ids
  - page provenance

### pws-structuring-service

Refactor role:

- stop being the separate ingestion entry point for uploaded files
- become a structured-workflow service over canonical artifacts

Keep:

- deterministic outline rendering
- related requirement workflows
- hierarchy export
- workspace save/export

Move away from:

- standalone `stage1`, `outline`, `rich-import`, `merged-import` upload endpoints as primary ingestion methods

Target role:

- consume canonical artifacts already created by the common ingestion pipeline
- provide PWS-specific views and workflow APIs

### analysis-service

No major architectural change.

It should read retrieval outputs that already link back to canonical artifacts and section ids.

## Recommended Canonical Internal Contracts

### Upload Contract

One upload endpoint only:

- `POST /v1/documents/upload`

Returns:

- `document_id`
- ingestion job id
- artifact availability status

### Artifact Read Contracts

- `GET /v1/documents/{document_id}/structured-artifact`
- `GET /v1/documents/{document_id}/knowledge-artifact`
- `GET /v1/documents/{document_id}/views/outline`
- `GET /v1/documents/{document_id}/views/requirements`
- `GET /v1/documents/{document_id}/views/objects`
- `GET /v1/documents/{document_id}/views/chat-context`

### Deprecation Targets

Current endpoints that should be deprecated or demoted:

- `/v1/pws/stage1/upload`
- `/v1/pws/stage1/from-artifact`
- `/v1/pws/outline/upload`
- `/v1/pws/rich-import/upload`
- `/v1/pws/merged-import/upload`

These can remain temporarily as compatibility wrappers around canonical artifacts, but they should no longer be the primary architecture.

## UI Model

The UI should move to:

- one upload action
- one document id
- multiple views over the same artifacts

### Required Views

- Outline view
  - section tree from canonical hierarchy or PWS enrichment
- Requirements view
  - requirement-focused projection of the same section tree
- Tables/Images view
  - all extracted objects with section placement or unplaced status
- Chat/Retrieval view
  - AI interactions over the knowledge artifact

### UX Rule

Do not expose separate conceptual upload buttons for:

- outline
- rich
- merged

Those are implementation concerns, not user workflows.

## Migration Plan

### Phase 1: Canonical Artifact Introduction

- Add `structured_document_v1` production in `normalization-service`.
- Add `knowledge_index_v1` production in `retrieval-service`.
- Store both artifacts per upload for all documents.
- Keep existing PWS upload endpoints working as wrappers.

### Phase 2: PWS Enrichment Consolidation

- Move deterministic PWS cleanup and heading extraction into a versioned enrichment module under the canonical artifact flow.
- Keep:
  - line-number cleanup
  - TOC rejection
  - heading normalization
  - section validation
  - deterministic object-to-section alignment
- Emit section hierarchy into `structured_document_v1.enrichments.pws`.

### Phase 3: Retrieval Refactor

- Change `retrieval-service` to read canonical structured artifacts rather than ad hoc normalization outputs.
- Support:
  - section-aware chunking when hierarchy is strong
  - fallback page/text chunking when hierarchy is weak

### Phase 4: UI Simplification

- Replace separate import buttons with one upload.
- Fetch canonical outline/object/chat projections by `document_id`.
- Add an `Unplaced artifacts` view based on canonical alignment output, not frontend guesswork.

### Phase 5: Endpoint Cleanup

- Mark `stage1`, `outline`, `rich-import`, and `merged-import` upload routes deprecated.
- Keep read-only compatibility if needed during migration.
- Make canonical artifact endpoints the only supported ingestion interface.

## Specific Guidance for PWS/SOW Perfection

This is the critical part of the design.

### What must stay deterministic

- line-number stripping
- TOC detection/removal
- front matter detection
- classification banner cleanup
- heading normalization
- heading validation
- section numbering repair
- caption versus heading discrimination
- object-to-section alignment

### What should be versioned explicitly

- `cleaning_profile`
- `heading_profile`
- `alignment_profile`

For example:

- `pws_clean_v2`
- `pws_headings_v2`
- `pws_alignment_v1`

This makes regressions auditable.

### Confidence Design

Use confidence separately for:

- hierarchy quality
- section validation
- object alignment
- requirement tagging
- chunk linkage

Do not hide uncertainty.

### Fallback Design

If PWS extraction is weak:

- preserve cleaned text anyway
- preserve all tables/images anyway
- preserve partial hierarchy if valid
- still generate AI chunks
- mark weak areas explicitly rather than silently flattening everything

## Recommended Near-Term Implementation Sequence

1. Define `structured_document_v1` in `normalization-service`.
2. Move current deterministic PWS cleaner/parser logic into a reusable enrichment module under that service.
3. Change `retrieval-service` to ingest the canonical structured artifact.
4. Make `pws-structuring-service` read canonical artifacts rather than ingest files directly.
5. Collapse v4 upload UX to one upload and multiple views.

## Decision Summary

- Canonical source of truth: `structured_document_v1`
- AI index source of truth: `knowledge_index_v1`
- PWS/SOW extraction: deterministic enrichment, not separate ingestion
- Retrieval input: canonical structured artifact for all documents
- UI upload model: one upload, many views
- Graceful degradation: always index for AI, even when hierarchy is weak
