# IH2 Outline Import

This is the repeatable workflow for importing the IH2 SOW into StormSurge v4 without falling back to `DOC` sections or promoting table captions into fake headings.

## Files

- Source input used for cleanup:
  - `/home/admin/Downloads/(U_FOUO) J1_IH2 SOW_Draft1_working copy_v3.cleaned.v3.txt`
- Generated import-ready file:
  - `/home/admin/Downloads/IH2_SOW.cleaned.v4.md`
- Cleaner script:
  - `scripts/prepare_pws_outline_import.py`

## Regenerate the import file

```bash
python3 scripts/prepare_pws_outline_import.py \
  "/home/admin/Downloads/(U_FOUO) J1_IH2 SOW_Draft1_working copy_v3.cleaned.v3.txt" \
  "/home/admin/Downloads/IH2_SOW.cleaned.v4.md"
```

## What the cleaner does

- Removes TOC, Table of Figures, and Table of Tables entries.
- Removes `[image: ]` markers and figure classification scaffolding.
- Removes repeated classification banners and inline `(U)` markers.
- Converts numbered headings into markdown headings.
- Normalizes bullets from Word/text extraction into markdown bullets.
- Avoids promoting OCR line-number-prefixed `Figure` and `Table` captions into headings.
- Drops stray `Table is UNCLASSIFIED` lines.

## Runtime protections added

The PWS structuring service also includes parser hardening for IH2-style files:

- Plain numbered headings are recognized even without markdown heading markers.
- `.md`, `.markdown`, and `.txt` uploads bypass Docling normalization and are parsed directly.
- Embedded image filenames such as `image23.png` are ignored.
- Acronym parentheticals such as `(IH2)` and `(T2)` are not treated as ordered-list bullets.
- TOC dot-leader lines are rejected as headings.

## Expected upload result

Uploading `/home/admin/Downloads/IH2_SOW.cleaned.v4.md` through the v4 outline import should yield these top-level sections:

- `1 Overview`
- `2 Applicable Documents`
- `3 Requirements`

## Important v4 behavior

The current v4 UI stores the imported workspace in browser `localStorage`, not in a server-side project record. That means:

- the cleaner script and generated markdown file are the durable import assets
- importing from the terminal can verify the backend parse, but it cannot force the active outline into an already-open browser session
