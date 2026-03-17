# Rich Import Flow

This flow is for PWS cleanup when you want to preserve tables and image positions instead of flattening them into plain text.

## Why this exists

The IH2 outline cleaner in `scripts/prepare_pws_outline_import.py` is intentionally destructive:

- it removes line noise
- it strips image markers
- it flattens tables into plain text
- it optimizes for v4 outline import, not fidelity

That is correct for `outline.md`, but wrong for a preservation-oriented review artifact.

## New script

- `scripts/prepare_pws_rich_import.py`

It produces:

- `<prefix>.rich.json`
  - ordered blocks from the Docling structured document
  - stage1 section hierarchy
  - normalized markdown
  - original structured document payload
- `<prefix>.rich.md`
  - markdown with headings preserved
  - markdown tables for table blocks
  - image placeholders preserved in position with captions and source refs

## Recommended usage

### Option 1: Use a saved artifact JSON

If you already have an artifact that contains:

- `structured_document` or `docling_structured_document`
- `normalized_markdown`

run:

```bash
python3 scripts/prepare_pws_rich_import.py artifact.json /tmp/my-pws
```

### Option 2: Use the original `.docx` or PDF

This requires running in an environment where Docling is installed, such as the `pws-structuring-service` runtime.

```bash
python3 scripts/prepare_pws_rich_import.py original.docx /tmp/my-pws
```

If Docling is not available in the current Python environment, the script will tell you to either:

- run it from the PWS structuring service environment, or
- use an artifact JSON instead

## Current fidelity

### Preserved well

- heading order and numbering
- tables as structured rows
- image positions as explicit blocks
- image captions and source refs when available
- page provenance when present in the Docling data

### Not fully preserved yet

- embedded binary image export
- pixel-accurate layout
- Word-native table styling

The current output is preservation-oriented markdown and JSON, not a perfect visual reconstruction.

## Relationship to outline import

Use the rich flow for review/preservation.

Use `scripts/prepare_pws_outline_import.py` when you need the v4 outline import file.

In practice, the right setup is:

1. rich artifact for fidelity
2. outline artifact for editable v4 section import
