import html
import json
import re
from typing import Any


HEADING_PATTERN = re.compile(r"^(?P<hashes>#+)\s+(?P<body>.+)$")
NUMBERED_TITLE_PATTERN = re.compile(
    r"^(?P<section_number>(?:[A-Za-z]+\.)?\d+(?:\.\d+)*|[A-Za-z]+\.\d+(?:\.\d+)*)\s+(?P<section_title>.+)$"
)
BOLD_LINE_PATTERN = re.compile(r"^\*\*(?P<body>.+?)\*\*$")
BULLET_PATTERN = re.compile(r"^[-*]\s+(?P<body>.+)$")
ORDERED_BULLET_PATTERN = re.compile(r"^(?P<marker>\d+\.|[A-Za-z]\.|(?:\([A-Za-z0-9ivxIVX]+\))+)\s+(?P<body>.+)$")
INLINE_ORDERED_ITEM_PATTERN = re.compile(
    r"(?:(?<=^)|(?<=\s))(?P<marker>\d+\.|[A-Za-z]\.|(?:\([A-Za-z0-9ivxIVX]+\))+)\s+(?P<body>.*?)(?=(?:\s(?:(?:\d+\.|[A-Za-z]\.|(?:\([A-Za-z0-9ivxIVX]+\))+))\s)|$)"
)
CLASSIFICATION_PREFIX_PATTERN = re.compile(
    r"^(?:\((?:U|C|S|TS|FOUO|U//FOUO|U/FOUO|S//NF|TS//SI//NF)\)\s*)+",
    re.IGNORECASE,
)
IMAGE_ONLY_PATTERN = re.compile(r"^<!--\s*image\s*-->$", re.IGNORECASE)
FRONT_MATTER_TITLES = {"table of contents", "figures", "tables"}


def normalize_text(text: str) -> str:
    return " ".join(html.unescape(text).replace("\r", "\n").split())


def clean_display_text(text: str) -> str:
    cleaned = normalize_text(text)
    cleaned = CLASSIFICATION_PREFIX_PATTERN.sub("", cleaned).strip()
    return cleaned


def is_classification_marker(marker: str) -> bool:
    token = marker.strip("()").upper()
    return token in {"U", "C", "S", "TS", "FOUO"}


def is_likely_table_text(text: str) -> bool:
    normalized = str(text or "").strip()
    return normalized.count("|") >= 6


def parse_heading(line: str) -> dict[str, Any] | None:
    stripped = line.strip()
    match = HEADING_PATTERN.match(stripped)
    markdown_level = None
    body = ""
    if match is not None:
        markdown_level = len(match.group("hashes"))
        body = normalize_text(match.group("body"))
    else:
        bold_match = BOLD_LINE_PATTERN.match(stripped)
        if bold_match is None:
            return None
        body = normalize_text(bold_match.group("body"))

    numbered = NUMBERED_TITLE_PATTERN.match(body)
    if numbered is None:
        return None
    section_number = numbered.group("section_number")
    section_title = numbered.group("section_title")
    return {
        "section_number": section_number,
        "section_title": section_title,
        "depth": len(section_number.split(".")),
        "markdown_level": markdown_level,
        "children": [],
    }


def build_outline(markdown: str) -> list[dict[str, Any]]:
    sections: list[dict[str, Any]] = []
    stack: list[dict[str, Any]] = []
    current_section: dict[str, Any] | None = None
    current_paragraph: dict[str, Any] | None = None
    paragraph_index = 0
    bullet_index = 0
    paragraph_lines: list[str] = []

    def attach_inline_ordered_items(paragraph: dict[str, Any]) -> None:
        text = paragraph.get("text_exact", "")
        if is_likely_table_text(text):
            return
        matches = list(INLINE_ORDERED_ITEM_PATTERN.finditer(text))
        if len(matches) < 2:
            return
        prefix = text[: matches[0].start()].strip()
        if prefix:
            paragraph["text_exact"] = normalize_text(prefix)
        else:
            paragraph["text_exact"] = ""
        for match in matches:
            if is_classification_marker(match.group("marker")):
                paragraph["text_exact"] = normalize_text(text)
                paragraph["children"] = []
                return
            paragraph["children"].append(
                {
                    "type": "bullet",
                    "id": f"{paragraph['id']}.i{len(paragraph['children']) + 1}",
                    "marker": match.group("marker"),
                    "text_exact": normalize_text(match.group("body")),
                }
            )

    def flush_paragraph() -> None:
        nonlocal current_paragraph, paragraph_index, paragraph_lines, bullet_index
        if current_section is None or not paragraph_lines:
            paragraph_lines = []
            return
        paragraph_index += 1
        bullet_index = 0
        current_paragraph = {
            "type": "paragraph",
            "id": f"{current_section['section_number']}.p{paragraph_index}",
            "text_exact": normalize_text(" ".join(paragraph_lines)),
            "children": [],
        }
        attach_inline_ordered_items(current_paragraph)
        current_section["children"].append(current_paragraph)
        paragraph_lines = []

    for raw_line in markdown.splitlines():
        line = raw_line.rstrip()
        if not line.strip():
            flush_paragraph()
            continue
        if IMAGE_ONLY_PATTERN.match(line.strip()):
            continue
        heading = parse_heading(line)
        if heading is not None:
            flush_paragraph()
            current_paragraph = None
            paragraph_index = 0
            bullet_index = 0
            while stack and stack[-1]["depth"] >= heading["depth"]:
                stack.pop()
            heading["parent_section_number"] = stack[-1]["section_number"] if stack else None
            if stack:
                stack[-1]["children"].append(heading)
            else:
                sections.append(heading)
            stack.append(heading)
            current_section = heading
            continue
        bullet = BULLET_PATTERN.match(line.strip())
        ordered_bullet = ORDERED_BULLET_PATTERN.match(line.strip())
        if ordered_bullet is not None and is_classification_marker(ordered_bullet.group("marker")):
            ordered_bullet = None
        if bullet is not None or ordered_bullet is not None:
            flush_paragraph()
            if current_section is None:
                continue
            bullet_index += 1
            marker = "-"
            body = ""
            if bullet is not None:
                body = bullet.group("body")
                marker = "-"
            else:
                body = ordered_bullet.group("body")
                marker = ordered_bullet.group("marker")
            bullet_record = {
                "type": "bullet",
                "id": f"{current_section['section_number']}.p{paragraph_index}.b{bullet_index}",
                "marker": marker,
                "text_exact": normalize_text(body),
            }
            if current_paragraph is None:
                current_paragraph = {
                    "type": "paragraph",
                    "id": f"{current_section['section_number']}.p{max(paragraph_index, 1)}",
                    "text_exact": "",
                    "children": [],
                }
                if not current_section["children"] or current_section["children"][-1] is not current_paragraph:
                    current_section["children"].append(current_paragraph)
            current_paragraph["children"].append(bullet_record)
            continue
        paragraph_lines.append(line.strip())

    flush_paragraph()
    return normalize_document_numbering(sections)


def normalize_section_number(section_number: str, offset: int) -> str:
    parts = section_number.split(".")
    if not parts or not parts[0].isdigit():
        return section_number
    first_value = int(parts[0]) - offset
    if first_value <= 0:
        return section_number
    return ".".join([str(first_value), *parts[1:]])


def normalize_document_numbering(sections: list[dict[str, Any]]) -> list[dict[str, Any]]:
    if not sections:
        return sections

    working = list(sections)
    leading_front_matter = 0
    for section in working:
        title = clean_display_text(section.get("section_title", "")).lower()
        if title in FRONT_MATTER_TITLES:
            leading_front_matter += 1
            continue
        break

    if leading_front_matter:
        working = working[leading_front_matter:]

    if not working:
        return working

    first_number = working[0].get("section_number", "")
    offset = 0
    if leading_front_matter and isinstance(first_number, str) and first_number.isdigit():
        first_value = int(first_number)
        if first_value > 1:
            offset = first_value - 1

    if offset == 0:
        return working

    def rewrite_descendant_ids(children: list[dict[str, Any]], old_prefix: str, new_prefix: str) -> list[dict[str, Any]]:
        updated_children: list[dict[str, Any]] = []
        for child in children:
            updated_child = dict(child)
            child_id = updated_child.get("id")
            if isinstance(child_id, str) and child_id.startswith(f"{old_prefix}."):
                updated_child["id"] = f"{new_prefix}{child_id[len(old_prefix):]}"
            if "children" in updated_child:
                updated_child["children"] = rewrite_descendant_ids(
                    updated_child.get("children", []), old_prefix, new_prefix
                )
            updated_children.append(updated_child)
        return updated_children

    def normalize_node(node: dict[str, Any]) -> dict[str, Any]:
        updated = dict(node)
        if "section_number" in updated:
            original_number = updated["section_number"]
            normalized_number = normalize_section_number(original_number, offset)
            updated["section_number"] = normalized_number
            parent_number = updated.get("parent_section_number")
            if isinstance(parent_number, str):
                updated["parent_section_number"] = normalize_section_number(parent_number, offset)
            children = []
            for child in updated.get("children", []):
                if isinstance(child, dict) and "section_number" in child:
                    children.append(normalize_node(child))
                else:
                    children.append(child)
            updated["children"] = rewrite_descendant_ids(children, original_number, normalized_number)
        return updated

    return [normalize_node(section) for section in working]


def count_outline_stats(nodes: list[dict[str, Any]]) -> dict[str, int]:
    counts = {"sections": 0, "paragraphs": 0, "bullets": 0}
    for node in nodes:
        if "section_number" in node:
            counts["sections"] += 1
        node_type = node.get("type")
        if node_type == "paragraph":
            counts["paragraphs"] += 1
        elif node_type == "bullet":
            counts["bullets"] += 1
        counts_child = count_outline_stats(node.get("children", []))
        for key, value in counts_child.items():
            counts[key] += value
    return counts


def collect_requirements(
    nodes: list[dict[str, Any]], current_section: str | None = None
) -> list[dict[str, str]]:
    rows: list[dict[str, str]] = []
    for node in nodes:
        if "section_number" in node:
            section_label = (
                f"{node.get('section_number', '')} {clean_display_text(node.get('section_title', ''))}".strip()
            )
            rows.extend(collect_requirements(node.get("children", []), section_label))
            continue
        if node.get("type") == "paragraph":
            rows.append(
                {
                    "id": str(node.get("id", "")),
                    "section": current_section or "",
                    "text": clean_display_text(node.get("text_exact", "")),
                }
            )
            continue
        rows.extend(collect_requirements(node.get("children", []), current_section))
    return rows


def _esc(value: str) -> str:
    return html.escape(value, quote=True)


def render_outline_node(node: dict[str, Any], related_links: dict[str, list[dict[str, Any]]] | None = None) -> str:
    if node.get("type") == "paragraph":
        clean_text = clean_display_text(node.get("text_exact", ""))
        body = _esc(clean_text)
        section_label = str(node.get("section_label") or "")
        children = "".join(render_outline_node(child, related_links) for child in node.get("children", []))
        related_html = ""
        paragraph_id = node.get("id")
        if isinstance(paragraph_id, str) and related_links and paragraph_id in related_links:
            items = []
            for item in related_links[paragraph_id]:
                label = "Governing section" if item.get("relationship") == "governing_section" else "Referenced appendix"
                snippets = item.get("supporting_snippets", [])
                snippet_html = "".join(
                    (
                        "<div class='related-snippet-row'>"
                        f"<div class='related-cite'>{_esc(str((snippet.get('section_number') if isinstance(snippet, dict) else None) or item.get('cited_section') or ''))}</div>"
                        f"<div class='related-snippet'>{_esc(snippet.get('snippet') if isinstance(snippet, dict) else str(snippet))}</div>"
                        "</div>"
                    )
                    for snippet in snippets
                )
                items.append(
                    "<div class='related-item'>"
                    f"<div class='related-label'>{_esc(label)}</div>"
                    f"<div class='related-head'>{_esc(item['source_document'])}</div>"
                    f"<div class='related-meta'>Cited source: {_esc(str(item.get('cited_section') or ''))}</div>"
                    f"{snippet_html}"
                    "</div>"
                )
            related_html = (
                f"<details class='related-panel'>"
                f"<summary>Related context ({len(related_links[paragraph_id])})</summary>"
                f"<div class='related-list'>{''.join(items)}</div>"
                f"</details>"
            )
        return (
            f"<div class='paragraph requirement-node' data-requirement-id='{_esc(str(node.get('id', '')))}' "
            f"data-requirement-section='{_esc(section_label)}' data-requirement-text='{_esc(clean_text)}'>"
            f"<div class='para-head'>"
            f"<label class='req-check' aria-label='Select source requirement'><input type='checkbox' name='source_requirement' onchange=\"toggleSourceRequirement('{_esc(str(node.get('id', '')))}', this.checked)\"></label>"
            f"<div class='para-title'><span class='para-id'>{_esc(node.get('id', ''))}</span><span class='para-title-text'>{body}</span></div>"
            f"</div>"
            f"<div class='linked-companion-list' id='linked-companion-{_esc(str(node.get('id', '')))}'></div>"
            f"<div class='linked-related-list' id='linked-related-{_esc(str(node.get('id', '')))}'></div>"
            f"{related_html}{children}</div>"
        )
    if node.get("type") == "bullet":
        body = _esc(clean_display_text(node.get("text_exact", "")))
        return (
            f"<div class='bullet'>"
            f"<span class='bullet-text'>{body}</span>"
            f"</div>"
        )

    title = f"{node.get('section_number', '')} {clean_display_text(node.get('section_title', ''))}".strip()
    section_label = title
    children = "".join(
        render_outline_node(
            child if "section_number" in child else {**child, "section_label": section_label},
            related_links,
        )
        for child in node.get("children", [])
    )
    return (
        f"<details class='section' open>"
        f"<summary>{_esc(title)}</summary>"
        f"<div class='section-body'>{children}</div>"
        f"</details>"
    )


def render_upload_page(
    error_message: str | None = None,
    active_projects: list[dict[str, Any]] | None = None,
    saved_workspaces: list[dict[str, Any]] | None = None,
) -> str:
    error_html = f"<div class='error'>{_esc(error_message)}</div>" if error_message else ""
    project_options = ["<option value=''>Select active project</option>"]
    for project in active_projects or []:
        project_id = str(project.get("project_id", "")).strip()
        if not project_id:
            continue
        display_name = str(project.get("display_name") or project_id).strip()
        sample_filenames = [str(item) for item in (project.get("sample_filenames") or []) if item]
        document_count = project.get("document_count")
        latest_document_at = project.get("latest_document_at")
        meta_bits = []
        if document_count is not None:
            meta_bits.append(f"{document_count} docs")
        if latest_document_at:
            meta_bits.append(str(latest_document_at)[:10])
        if sample_filenames:
            meta_bits.append(sample_filenames[0])
        suffix = f" ({' · '.join(meta_bits)})" if meta_bits else ""
        project_options.append(
            f"<option value='{_esc(project_id)}'>{_esc(display_name + ' · ' + project_id + suffix)}</option>"
        )
    saved_items = []
    for workspace in saved_workspaces or []:
        workspace_id = str(workspace.get("workspace_id", "")).strip()
        if not workspace_id:
            continue
        workspace_name = str(workspace.get("workspace_name") or workspace_id).strip()
        filename = str(workspace.get("filename") or "").strip()
        project_label = str(workspace.get("project_id") or "No project").strip()
        updated_at = str(workspace.get("updated_at") or "").strip()
        saved_items.append(
            "<a class='saved-item' href='/ui/workspaces/"
            + _esc(workspace_id)
            + "'>"
            + "<div class='saved-head'>"
            + f"<div class='saved-name'>{_esc(workspace_name)}</div>"
            + f"<div class='saved-meta'>{_esc(project_label)}</div>"
            + "</div>"
            + f"<div class='saved-file'>{_esc(filename)}</div>"
            + f"<div class='saved-time'>{_esc(updated_at[:16].replace('T', ' '))}</div>"
            + "</a>"
        )
    saved_html = (
        "<section class='saved-workspaces'>"
        "<div class='saved-title-row'><div class='saved-title'>Saved Workspaces</div>"
        f"<div class='saved-count'>{len(saved_items)}</div></div>"
        "<div class='saved-list'>"
        + ("".join(saved_items) if saved_items else "<div class='saved-empty'>No saved workspaces</div>")
        + "</div></section>"
    )
    return f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>StormSurge</title>
  <style>
    :root {{
      --bg: #edf2f7;
      --shell: rgba(248, 251, 255, 0.92);
      --paper: #ffffff;
      --paper-soft: #f5f8fc;
      --ink: #0f172a;
      --muted: #5b677a;
      --line: #d4deea;
      --line-strong: #b8c6d8;
      --accent: #0a66e8;
      --accent-soft: #e0ecff;
      --danger: #c22828;
      --danger-soft: #fde8e8;
    }}
    * {{ box-sizing: border-box; }}
    body {{
      margin: 0;
      min-height: 100vh;
      font-family: "Aptos", "Segoe UI Variable Text", "Segoe UI", sans-serif;
      color: var(--ink);
      background:
        linear-gradient(rgba(148, 163, 184, 0.08) 1px, transparent 1px),
        linear-gradient(90deg, rgba(148, 163, 184, 0.08) 1px, transparent 1px),
        linear-gradient(180deg, #f8fbff 0, var(--bg) 100%);
      background-size: 28px 28px, 28px 28px, auto;
      padding: 16px;
    }}
    .shell {{
      max-width: 1320px;
      margin: 0 auto;
      min-height: calc(100vh - 32px);
      display: grid;
      align-items: center;
      justify-items: center;
    }}
    .sidebar {{
      align-self: stretch;
      background: rgba(255,255,255,.68);
      border: 1px solid var(--line);
      border-radius: 22px;
      box-shadow: 0 24px 80px rgba(15, 23, 42, 0.08);
      padding: 18px 14px;
      display: flex;
      flex-direction: column;
      gap: 18px;
      backdrop-filter: blur(10px);
    }}
    .brand {{
      padding: 4px 6px 0;
    }}
    .brand-mark {{
      font-size: 11px;
      font-weight: 700;
      letter-spacing: .18em;
      text-transform: uppercase;
      color: var(--muted);
    }}
    .brand-title {{
      margin-top: 6px;
      font-size: 20px;
      font-weight: 700;
      letter-spacing: -.03em;
    }}
    .nav-group {{
      display: grid;
      gap: 8px;
    }}
    .nav-label {{
      padding: 0 6px;
      font-size: 11px;
      font-weight: 700;
      letter-spacing: .16em;
      text-transform: uppercase;
      color: var(--muted);
    }}
    .nav-item {{
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      padding: 10px 12px;
      border: 1px solid var(--line);
      border-radius: 14px;
      background: var(--paper);
      color: var(--ink);
      font-size: 14px;
      font-weight: 600;
    }}
    .nav-item.active {{
      border-color: var(--accent);
      background: var(--accent-soft);
    }}
    .nav-item.inactive {{
      color: var(--muted);
      background: var(--paper-soft);
    }}
    .nav-badge {{
      padding: 4px 8px;
      border-radius: 999px;
      background: var(--paper-soft);
      color: var(--muted);
      font-size: 11px;
      font-weight: 700;
      letter-spacing: .04em;
      text-transform: uppercase;
    }}
    .card {{
      width: min(760px, 100%);
      background: var(--shell);
      border: 1px solid var(--line);
      border-radius: 24px;
      box-shadow: 0 24px 80px rgba(15, 23, 42, 0.12);
      padding: 28px;
      backdrop-filter: blur(10px);
    }}
    h1 {{
      margin: 0;
      font-size: clamp(32px, 5vw, 52px);
      line-height: 1.02;
      letter-spacing: -.04em;
      font-weight: 700;
    }}
    p {{
      margin: 14px 0 0;
      color: var(--muted);
      font-size: 15px;
      line-height: 1.7;
      max-width: 58ch;
    }}
    .eyebrow {{
      margin-bottom: 10px;
      font-size: 11px;
      font-weight: 700;
      letter-spacing: .18em;
      text-transform: uppercase;
      color: var(--muted);
    }}
    .rules {{
      padding: 16px 18px;
      border-radius: 16px;
      background: var(--paper-soft);
      border: 1px solid var(--line);
      margin: 18px 0 20px;
      color: var(--ink);
      line-height: 1.65;
      font-size: 14px;
    }}
    form {{
      display: grid;
      gap: 12px;
    }}
    label {{
      display: grid;
      gap: 8px;
      font-size: 14px;
      font-weight: 600;
    }}
    input[type="file"], select {{
      width: 100%;
      padding: 14px 16px;
      border: 1px dashed var(--line-strong);
      border-radius: 18px;
      background: var(--paper);
      font: inherit;
    }}
    select {{
      border-style: solid;
      appearance: none;
      background-image:
        linear-gradient(45deg, transparent 50%, var(--muted) 50%),
        linear-gradient(135deg, var(--muted) 50%, transparent 50%);
      background-position:
        calc(100% - 20px) calc(50% - 3px),
        calc(100% - 14px) calc(50% - 3px);
      background-size: 6px 6px, 6px 6px;
      background-repeat: no-repeat;
      padding-right: 36px;
    }}
    button {{
      justify-self: start;
      border: 0;
      background: var(--accent);
      color: white;
      padding: 10px 14px;
      border-radius: 12px;
      font: inherit;
      cursor: pointer;
      font-weight: 700;
      letter-spacing: -.01em;
    }}
    .meta {{
      display: flex;
      justify-content: space-between;
      gap: 12px;
      flex-wrap: wrap;
      color: var(--muted);
      font-size: 12px;
    }}
    .error {{
      margin-top: 14px;
      padding: 12px 14px;
      border-radius: 14px;
      background: var(--danger-soft);
      color: var(--danger);
      border: 1px solid rgba(194,40,40,.18);
    }}
    .saved-workspaces {{
      margin-top: 18px;
      padding-top: 18px;
      border-top: 1px solid var(--line);
      display: grid;
      gap: 12px;
    }}
    .saved-title-row {{
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
    }}
    .saved-title {{
      font-size: 12px;
      font-weight: 700;
      letter-spacing: .16em;
      text-transform: uppercase;
      color: var(--muted);
    }}
    .saved-count {{
      padding: 4px 8px;
      border-radius: 999px;
      background: var(--paper-soft);
      border: 1px solid var(--line);
      color: var(--muted);
      font-size: 12px;
      font-weight: 700;
    }}
    .saved-list {{
      display: grid;
      gap: 10px;
    }}
    .saved-item {{
      display: grid;
      gap: 6px;
      padding: 14px 16px;
      border: 1px solid var(--line);
      border-radius: 16px;
      background: var(--paper);
      color: inherit;
      text-decoration: none;
    }}
    .saved-item:hover {{
      border-color: var(--accent);
      background: var(--paper-soft);
    }}
    .saved-head {{
      display: flex;
      justify-content: space-between;
      gap: 12px;
      align-items: baseline;
    }}
    .saved-name {{
      font-size: 15px;
      font-weight: 700;
      letter-spacing: -.02em;
    }}
    .saved-meta, .saved-file, .saved-time, .saved-empty {{
      color: var(--muted);
      font-size: 13px;
      line-height: 1.5;
    }}
    @media (max-width: 720px) {{
      .sidebar {{
        border-radius: 18px;
      }}
      .card {{
        padding: 20px;
        border-radius: 18px;
      }}
    }}
  </style>
</head>
<body>
  <div class="shell">
    <main class="card">
      <div class="eyebrow">StormSurge</div>
      <h1>StormSurge</h1>
      <p>Upload one PWS, run the structuring pipeline, and review the extracted hierarchy in a clean collapsible browser.</p>
      <div class="rules">
        Structure only. No requirement extraction, no retrieval, no chat, no appendix guessing.
        Output is organized as section, subsection, paragraph, then bullet so you can inspect intermediate structure before downstream phases.
      </div>
      <form action="/ui/upload" method="post" enctype="multipart/form-data">
      <label>Primary PWS</label>
      <input type="file" name="primary_file" accept=".doc,.docx,.pdf,.txt,.md" required>
      <label>Project ID</label>
      <select name="project_id">
        {''.join(project_options)}
      </select>
      <div class="meta">
        <span>Supported: PDF, DOCX, TXT, Markdown</span>
        <span>Choose an active project for requirement search</span>
      </div>
      <button type="submit">Build Hierarchy</button>
      </form>
      {saved_html}
      {error_html}
    </main>
  </div>
</body>
</html>
"""


def render_result_page(
    filename: str,
    outline: list[dict[str, Any]],
    project_id: str | None = None,
    related_links: dict[str, list[dict[str, Any]]] | None = None,
    related_document_count: int = 0,
    notices: list[str] | None = None,
    workspace_id: str | None = None,
    workspace_name: str | None = None,
    initial_linked_requirements_by_source: dict[str, list[dict[str, Any]]] | None = None,
    initial_selected_requirement_id: str | None = None,
    initial_selected_requirement_ids: list[str] | None = None,
    initial_active_tool: str | None = None,
    initial_solution_groups: list[dict[str, Any]] | None = None,
    initial_companion_notes_by_requirement: dict[str, list[dict[str, Any]]] | None = None,
) -> str:
    stats = count_outline_stats(outline)
    rendered = "".join(render_outline_node(node, related_links) for node in outline)
    notices_html = ""
    if notices:
        notices_html = "<div class='notices'>" + "".join(
            f"<div class='notice'>{_esc(item)}</div>" for item in notices
        ) + "</div>"
    return f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>StormSurge</title>
  <style>
    :root {{
      --bg: #edf2f7;
      --paper: #ffffff;
      --paper-soft: #f5f8fc;
      --ink: #0f172a;
      --muted: #5b677a;
      --line: #d4deea;
      --line-strong: #b8c6d8;
      --accent: #0a66e8;
      --accent-soft: #e0ecff;
    }}
    * {{ box-sizing: border-box; }}
    body {{
      margin: 0;
      font-family: "Aptos", "Segoe UI Variable Text", "Segoe UI", sans-serif;
      color: var(--ink);
      background:
        linear-gradient(rgba(148, 163, 184, 0.07) 1px, transparent 1px),
        linear-gradient(90deg, rgba(148, 163, 184, 0.07) 1px, transparent 1px),
        linear-gradient(180deg, #f8fbff 0, var(--bg) 100%);
      background-size: 28px 28px, 28px 28px, auto;
      height: 100vh;
      overflow: hidden;
    }}
    .wrap {{
      max-width: 1540px;
      margin: 0 auto;
      padding: 16px 16px 16px;
      display: grid;
      grid-template-columns: 280px minmax(0, 1fr);
      gap: 16px;
      height: 100vh;
    }}
    .sidebar {{
      align-self: start;
      position: sticky;
      top: 16px;
      background: rgba(255,255,255,.68);
      border: 1px solid var(--line);
      border-radius: 22px;
      box-shadow: 0 24px 80px rgba(15, 23, 42, 0.08);
      padding: 18px 16px;
      display: flex;
      flex-direction: column;
      gap: 18px;
      backdrop-filter: blur(10px);
      height: calc(100vh - 32px);
    }}
    .brand {{
      padding: 4px 6px 0;
    }}
    .brand-mark {{
      font-size: 11px;
      font-weight: 700;
      letter-spacing: .18em;
      text-transform: uppercase;
      color: var(--muted);
    }}
    .brand-title {{
      margin-top: 6px;
      font-size: 20px;
      font-weight: 700;
      letter-spacing: -.03em;
    }}
    .nav-group {{
      display: grid;
      gap: 8px;
    }}
    .nav-label {{
      padding: 0 6px;
      font-size: 11px;
      font-weight: 700;
      letter-spacing: .16em;
      text-transform: uppercase;
      color: var(--muted);
    }}
    .nav-item {{
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      padding: 11px 12px;
      border: 1px solid var(--line);
      border-radius: 14px;
      background: var(--paper);
      color: var(--ink);
      font-size: 14px;
      font-weight: 600;
      line-height: 1.35;
      cursor: pointer;
    }}
    .nav-item button {{
      all: unset;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      width: 100%;
      cursor: pointer;
    }}
    .nav-item span:first-child {{
      flex: 1;
      min-width: 0;
    }}
    .nav-item.active {{
      border-color: var(--accent);
      background: var(--accent-soft);
    }}
    .nav-item.inactive {{
      color: var(--muted);
      background: var(--paper-soft);
    }}
    .nav-badge {{
      padding: 4px 8px;
      border-radius: 999px;
      background: var(--paper-soft);
      color: var(--muted);
      font-size: 11px;
      font-weight: 700;
      letter-spacing: .04em;
      text-transform: uppercase;
      white-space: nowrap;
    }}
    .nav-copy {{
      border-top: 1px solid var(--line);
      padding-top: 16px;
      color: var(--muted);
      font-size: 13px;
      line-height: 1.55;
    }}
    .side-title {{
      font-size: 12px;
      font-weight: 700;
      letter-spacing: .16em;
      text-transform: uppercase;
      color: var(--muted);
    }}
    .content-area {{
      display: grid;
      gap: 16px;
      min-width: 0;
      grid-template-rows: auto minmax(0, 1fr) auto;
      min-height: 0;
      height: calc(100vh - 32px);
    }}
    .hierarchy-shell {{
      min-height: 0;
      overflow: auto;
      padding-right: 4px;
    }}
    .workspace-pane {{
      position: relative;
      background: var(--paper);
      border: 1px solid var(--line);
      border-radius: 20px;
      box-shadow: 0 16px 34px rgba(15, 23, 42, 0.08);
      padding: 16px 16px 14px;
      display: grid;
      gap: 14px;
      min-height: 0;
      overflow: auto;
      height: 360px;
    }}
    .resize-handle {{
      position: sticky;
      top: -16px;
      z-index: 2;
      margin: -16px -16px 0;
      padding: 10px 0 8px;
      background: var(--paper);
      cursor: ns-resize;
      border-top-left-radius: 20px;
      border-top-right-radius: 20px;
    }}
    .resize-grip {{
      width: 72px;
      height: 6px;
      margin: 0 auto;
      border-radius: 999px;
      background: var(--line-strong);
    }}
    .workspace-pane.resizing,
    .workspace-pane.resizing * {{
      cursor: ns-resize !important;
      user-select: none;
    }}
    .pane-header {{
      display: flex;
      align-items: start;
      justify-content: space-between;
      gap: 12px;
      flex-wrap: wrap;
    }}
    .pane-title-block {{
      display: grid;
      gap: 4px;
    }}
    .pane-title {{
      font-size: 18px;
      font-weight: 700;
      letter-spacing: -.02em;
    }}
    .pane-subtitle {{
      color: var(--muted);
      font-size: 13px;
      line-height: 1.5;
      max-width: 72ch;
    }}
    .tool-chip {{
      display: inline-flex;
      align-items: center;
      padding: 6px 10px;
      border-radius: 999px;
      border: 1px solid var(--line);
      background: var(--paper);
      color: var(--muted);
      font-size: 12px;
      font-weight: 700;
      letter-spacing: .04em;
      text-transform: uppercase;
    }}
    .save-workspace-form {{
      display: flex;
      gap: 8px;
      align-items: center;
      flex-wrap: wrap;
    }}
    .save-input {{
      min-width: 220px;
      padding: 10px 12px;
      border: 1px solid var(--line);
      border-radius: 12px;
      background: var(--paper);
      color: var(--ink);
      font: inherit;
    }}
    .pane-grid {{
      display: grid;
      grid-template-columns: minmax(0, 0.95fr) minmax(0, 1.35fr);
      gap: 14px;
      align-items: start;
    }}
    .companion-layout {{
      display: grid;
      gap: 14px;
      min-width: 0;
    }}
    .companion-top-grid {{
      display: grid;
      grid-template-columns: minmax(0, 1fr);
      gap: 14px;
      align-items: start;
    }}
    .companion-answer-card {{
      border: 1px solid var(--line);
      border-radius: 16px;
      background: var(--paper);
      padding: 12px;
      display: grid;
      gap: 10px;
      min-height: 180px;
    }}
    .companion-answer-body {{
      font-size: 14px;
      line-height: 1.65;
      white-space: pre-wrap;
    }}
    .tool-panel[hidden] {{
      display: none !important;
    }}
    .pane-stack {{
      display: grid;
      gap: 12px;
      min-width: 0;
    }}
    .source-card, .search-card, .selected-card, .results-card {{
      border: 1px solid var(--line);
      border-radius: 16px;
      background: var(--paper);
      padding: 12px;
      display: grid;
      gap: 10px;
    }}
    .source-id {{
      font-size: 12px;
      font-weight: 700;
      color: var(--accent);
      letter-spacing: .04em;
      text-transform: uppercase;
    }}
    .source-section, .helper-text {{
      color: var(--muted);
      font-size: 12px;
      line-height: 1.5;
    }}
    .save-status {{
      min-height: 18px;
    }}
    .source-text {{
      font-size: 13px;
      line-height: 1.6;
      display: -webkit-box;
      -webkit-box-orient: vertical;
      -webkit-line-clamp: 3;
      overflow: hidden;
    }}
    .source-text.expanded {{
      display: block;
      -webkit-line-clamp: unset;
      overflow: visible;
    }}
    .search-input {{
      width: 100%;
      padding: 10px 12px;
      border: 1px solid var(--line-strong);
      border-radius: 12px;
      background: var(--paper-soft);
      font: inherit;
      color: var(--ink);
    }}
    .search-actions {{
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
    }}
    .search-actions button {{
      padding: 8px 10px;
      border-radius: 10px;
    }}
    .search-actions .primary {{
      background: var(--accent);
      color: white;
      border-color: var(--accent);
    }}
    .search-actions button:disabled {{
      opacity: .55;
      cursor: not-allowed;
    }}
    .results-list, .selected-list {{
      display: grid;
      gap: 8px;
      max-height: 340px;
      overflow: auto;
    }}
    .result-row, .selected-row {{
      border: 1px solid var(--line);
      border-radius: 14px;
      background: var(--paper-soft);
      padding: 10px;
      display: grid;
      gap: 8px;
    }}
    .result-head, .selected-head {{
      display: flex;
      align-items: start;
      justify-content: space-between;
      gap: 10px;
    }}
    .result-section, .selected-section {{
      color: var(--muted);
      font-size: 12px;
      line-height: 1.45;
    }}
    .result-text, .selected-text {{
      font-size: 13px;
      line-height: 1.55;
      display: -webkit-box;
      -webkit-box-orient: vertical;
      -webkit-line-clamp: 3;
      overflow: hidden;
    }}
    .result-text.expanded, .selected-text.expanded {{
      display: block;
      -webkit-line-clamp: unset;
      overflow: visible;
    }}
    .text-toggle,
    .result-row .text-toggle,
    .selected-row .text-toggle,
    .source-card .text-toggle {{
      padding: 0;
      border: 0 !important;
      background: transparent !important;
      color: var(--accent);
      font-size: 11px;
      font-weight: 600;
      line-height: 1.2;
      cursor: pointer;
      display: inline;
      justify-self: start;
      margin-top: -10px;
      border-radius: 0 !important;
      box-shadow: none !important;
      min-height: 0;
    }}
    .result-score {{
      font-size: 12px;
      color: var(--muted);
      white-space: nowrap;
    }}
    .result-row button, .selected-row button, .mini-action {{
      padding: 6px 10px;
      border-radius: 10px;
      border: 1px solid var(--line);
      background: var(--paper);
      color: var(--ink);
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
    }}
    .mini-action {{
      margin-top: 8px;
    }}
    .paragraph.selected-source {{
      box-shadow: inset 0 0 0 2px rgba(10,102,232,.2);
      background: #eef5ff;
    }}
    .paragraph.in-solution-group {{
      box-shadow: inset 0 0 0 1px rgba(183, 121, 31, .35);
    }}
    .linked-related-list {{
      display: grid;
      gap: 6px;
      margin-top: 6px;
    }}
    .linked-companion-list {{
      display: grid;
      gap: 6px;
      margin-top: 6px;
    }}
    .linked-related-item {{
      border: 1px solid #9fc9aa;
      background: #edf9f0;
      border-left: 4px solid #2f855a;
      border-radius: 10px;
      padding: 7px 10px 4px;
      display: grid;
      gap: 4px;
    }}
    .linked-related-head {{
      display: flex;
      align-items: start;
      justify-content: space-between;
      gap: 10px;
    }}
    .linked-related-label {{
      font-size: 11px;
      font-weight: 700;
      letter-spacing: .06em;
      text-transform: uppercase;
      color: #276749;
    }}
    .linked-related-meta {{
      color: var(--muted);
      font-size: 12px;
      line-height: 1.4;
    }}
    .linked-related-text {{
      font-size: 13px;
      line-height: 1.55;
      display: -webkit-box;
      -webkit-box-orient: vertical;
      -webkit-line-clamp: 3;
      overflow: hidden;
    }}
    .linked-related-text.expanded {{
      display: block;
      -webkit-line-clamp: unset;
      overflow: visible;
    }}
    .remove-related {{
      border: 0 !important;
      background: transparent !important;
      color: #276749 !important;
      padding: 0 !important;
      font-size: 14px !important;
      font-weight: 700 !important;
      line-height: 1 !important;
      min-height: 0 !important;
    }}
    .linked-companion-item {{
      border: 1px solid #b8c6d8;
      background: #f7f9fc;
      border-left: 4px solid #4a5568;
      border-radius: 10px;
      padding: 7px 10px 4px;
      display: grid;
      gap: 4px;
    }}
    .linked-companion-label {{
      font-size: 11px;
      font-weight: 700;
      letter-spacing: .06em;
      text-transform: uppercase;
      color: #334155;
    }}
    .linked-companion-text {{
      font-size: 13px;
      line-height: 1.55;
      white-space: pre-wrap;
    }}
    .remove-companion {{
      border: 0 !important;
      background: transparent !important;
      color: #334155 !important;
      padding: 0 !important;
      font-size: 14px !important;
      font-weight: 700 !important;
      line-height: 1 !important;
      min-height: 0 !important;
    }}
    .group-badges {{
      display: flex;
      gap: 6px;
      flex-wrap: wrap;
      margin-top: 4px;
    }}
    .group-badge {{
      display: inline-flex;
      align-items: center;
      padding: 3px 8px;
      border-radius: 999px;
      background: #fff2d8;
      border: 1px solid #e5c27d;
      color: #8a5a13;
      font-size: 11px;
      font-weight: 700;
      letter-spacing: .03em;
      text-transform: uppercase;
    }}
    .solution-textarea {{
      width: 100%;
      min-height: 96px;
      padding: 10px 12px;
      border: 1px solid var(--line-strong);
      border-radius: 12px;
      background: var(--paper-soft);
      font: inherit;
      color: var(--ink);
      resize: vertical;
    }}
    .group-list {{
      display: grid;
      gap: 10px;
    }}
    .group-item {{
      display: grid;
      gap: 8px;
      padding: 10px 12px;
      border: 1px solid var(--line);
      border-radius: 12px;
      background: var(--paper);
    }}
    .group-item-head {{
      display: flex;
      align-items: start;
      justify-content: space-between;
      gap: 10px;
    }}
    .group-name {{
      font-size: 13px;
      font-weight: 700;
      letter-spacing: -.01em;
    }}
    .group-meta {{
      color: var(--muted);
      font-size: 12px;
      line-height: 1.45;
    }}
    .group-notes {{
      color: var(--ink);
      font-size: 13px;
      line-height: 1.5;
      white-space: pre-wrap;
    }}
    .solution-subset {{
      margin: 5px 0;
      border: 1px solid #e5c27d;
      border-left: 4px solid #b7791f;
      border-radius: 10px;
      background: #fff8e8;
      overflow: hidden;
    }}
    .solution-subset > summary {{
      padding: 9px 12px;
      font-size: 13px;
      font-weight: 700;
      letter-spacing: -.01em;
      background: #fff3d7;
      border-bottom: 1px solid transparent;
    }}
    .solution-subset[open] > summary {{
      border-bottom-color: #ecd7ad;
    }}
    .solution-subset-body {{
      padding: 4px 8px 6px;
      display: grid;
      gap: 4px;
    }}
    .para-head {{
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 0;
    }}
    .para-title {{
      min-width: 0;
      display: flex;
      align-items: center;
      gap: 8px;
      flex: 1;
    }}
    .para-title-text {{
      line-height: 1.45;
      font-size: 14px;
      min-width: 0;
    }}
    .req-check {{
      display: flex;
      align-items: center;
      white-space: nowrap;
      align-self: center;
    }}
    .req-check input {{
      margin: 0;
      width: 15px;
      height: 15px;
    }}
    .hero {{
      padding: 18px 20px;
      background: rgba(248, 251, 255, 0.92);
      border: 1px solid var(--line);
      border-radius: 22px;
      box-shadow: 0 24px 80px rgba(15, 23, 42, .12);
      margin-bottom: 16px;
      backdrop-filter: blur(10px);
    }}
    h1 {{
      margin: 0 0 8px;
      font-size: clamp(28px, 4vw, 48px);
      line-height: 1.02;
      letter-spacing: -.04em;
      font-weight: 700;
    }}
    .sub {{
      margin: 0;
      color: var(--muted);
      font-size: 14px;
      line-height: 1.6;
    }}
    .stats {{
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
      margin-top: 12px;
    }}
    .pill {{
      border: 1px solid var(--line);
      background: var(--paper);
      border-radius: 999px;
      padding: 6px 10px;
      color: var(--muted);
      font-size: 13px;
    }}
    .toolbar {{
      display: flex;
      gap: 8px;
      margin-top: 12px;
      flex-wrap: wrap;
    }}
    button, a.button {{
      border: 1px solid var(--line);
      background: var(--paper);
      color: var(--ink);
      padding: 8px 12px;
      border-radius: 12px;
      cursor: pointer;
      font: inherit;
      text-decoration: none;
      font-size: 14px;
      font-weight: 600;
    }}
    .section {{
      background: rgba(255,255,255,.92);
      border: 1px solid var(--line);
      border-radius: 18px;
      margin: 10px 0;
      overflow: hidden;
      box-shadow: 0 10px 30px rgba(15, 23, 42, .04);
    }}
    summary {{
      list-style: none;
      cursor: pointer;
      padding: 12px 14px;
      font-size: 18px;
      font-weight: 700;
      border-bottom: 1px solid transparent;
      letter-spacing: -.02em;
    }}
    details[open] > summary {{
      border-bottom-color: var(--line);
      background: linear-gradient(90deg, rgba(10,102,232,.08), transparent);
    }}
    .section-body {{
      padding: 4px 10px 8px;
    }}
    .paragraph {{
      margin: 5px 0;
      padding: 5px 10px 2px;
      border-left: 4px solid var(--accent);
      background: var(--paper-soft);
      border-radius: 10px;
    }}
    .para-id {{
      color: var(--accent);
      font-size: 12px;
      font-weight: 700;
      letter-spacing: .04em;
      text-transform: uppercase;
      display: inline-flex;
      flex: 0 0 auto;
      white-space: nowrap;
    }}
    .bullet {{
      margin: 6px 0 0 14px;
      padding: 8px 10px;
      border: 1px solid var(--line);
      background: var(--paper);
      border-radius: 10px;
      line-height: 1.5;
      font-size: 13px;
    }}
    .bullet-text {{
      display: block;
    }}
    .related-panel {{
      margin-top: 12px;
      border: 1px solid #eadbc7;
      border-radius: 10px;
      background: #fffdf9;
      overflow: hidden;
    }}
    .related-panel > summary {{
      padding: 10px 12px;
      font-size: 15px;
      font-weight: 600;
      background: #fff7ed;
    }}
    .related-list {{
      padding: 8px 12px 12px;
    }}
    .related-item {{
      padding: 10px 0;
      border-top: 1px solid #efe2d2;
    }}
    .related-item:first-child {{
      border-top: 0;
    }}
    .related-label {{
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: .06em;
      color: var(--accent);
      font-weight: 700;
      margin-bottom: 4px;
    }}
    .related-head {{
      font-size: 14px;
      font-weight: 700;
    }}
    .related-meta {{
      color: var(--muted);
      font-size: 12px;
      margin-top: 2px;
    }}
    .related-snippet-row {{
      margin-top: 8px;
      padding-left: 10px;
      border-left: 3px solid #eadbc7;
    }}
    .related-cite {{
      color: var(--accent);
      font-size: 12px;
      font-weight: 700;
      margin-bottom: 2px;
    }}
    .related-snippet {{
      line-height: 1.45;
      font-size: 15px;
    }}
    .notices {{
      margin-top: 12px;
      display: grid;
      gap: 6px;
    }}
    .notice {{
      padding: 8px 10px;
      border-radius: 12px;
      border: 1px solid var(--line);
      background: var(--paper-soft);
      color: var(--muted);
      font-size: 14px;
    }}
    @media (max-width: 720px) {{
      .wrap {{
        grid-template-columns: 1fr;
      }}
      .sidebar {{
        position: static;
        border-radius: 18px;
      }}
      .pane-grid {{
        grid-template-columns: 1fr;
      }}
      .companion-top-grid {{
        grid-template-columns: 1fr;
      }}
      body {{
        overflow: auto;
        height: auto;
      }}
      .wrap {{
        height: auto;
        min-height: 100vh;
      }}
      .sidebar {{
        height: auto;
      }}
      .content-area {{
        grid-template-rows: auto minmax(0, 1fr) auto;
        height: auto;
      }}
      .workspace-pane {{
        position: relative;
        height: 460px;
      }}
      .wrap {{ padding: 12px 10px 20px; }}
      summary {{ font-size: 16px; }}
      .para-text {{ font-size: 15px; }}
    }}
  </style>
</head>
<body>
  <div class="wrap">
    <aside class="sidebar">
      <div class="brand">
        <div class="brand-mark">StormSurge</div>
        <div class="brand-title">Workspace</div>
      </div>
      <div class="nav-group">
        <div class="nav-label">Current</div>
        <div class="nav-item active" id="tool-nav-pws-structure">
          <button type="button" onclick="setActiveTool('pws-structure')">
            <span>PWS Structure</span>
            <span class="nav-badge">Live</span>
          </button>
        </div>
        <div class="nav-item active" id="tool-nav-requirement-search">
          <button type="button" onclick="setActiveTool('requirement-search')">
            <span>Requirement Search</span>
            <span class="nav-badge">Live</span>
          </button>
        </div>
        <div class="nav-item active" id="tool-nav-solution-helper">
          <button type="button" onclick="setActiveTool('solution-helper')">
            <span>Solution Helper</span>
            <span class="nav-badge">Live</span>
          </button>
        </div>
        <div class="nav-item active" id="tool-nav-llm-companion">
          <button type="button" onclick="setActiveTool('llm-companion')">
            <span>LLM Companion</span>
            <span class="nav-badge">Live</span>
          </button>
        </div>
      </div>
      <div class="nav-group">
        <div class="nav-label">Planned</div>
        <div class="nav-item inactive">
          <button type="button" disabled>
            <span>Review Queue</span>
            <span class="nav-badge">Soon</span>
          </button>
        </div>
        <div class="nav-item inactive">
          <button type="button" disabled>
            <span>LLM Helper</span>
            <span class="nav-badge">Soon</span>
          </button>
        </div>
        <div class="nav-item inactive">
          <button type="button" disabled>
            <span>Requirement Editor</span>
            <span class="nav-badge">Soon</span>
          </button>
        </div>
      </div>
      <div class="nav-copy">Tool workspace</div>
    </aside>
    <div class="content-area">
      <section class="hero">
        <h1>StormSurge</h1>
        <p class="sub">{_esc(filename)}</p>
        <div class="stats">
          <div class="pill">Sections: {stats["sections"]}</div>
          <div class="pill">Paragraphs: {stats["paragraphs"]}</div>
          <div class="pill">Bullets: {stats["bullets"]}</div>
        </div>
        <div class="toolbar">
          <button onclick="setAll(true)">Expand All</button>
          <button onclick="setAll(false)">Collapse All</button>
          <button type="button" onclick="exportHierarchyWorkbook()">Export Excel</button>
          <a class="button" href="/">Upload Another</a>
          <div class="save-workspace-form">
            <input id="workspace-name-input" class="save-input" type="text" placeholder="Workspace name" value="{_esc(workspace_name or '')}">
            <button type="button" onclick="saveWorkspace()">Save</button>
            <div class="helper-text save-status" id="save-workspace-status"></div>
          </div>
        </div>
        {notices_html}
      </section>
      <div class="hierarchy-shell">
        {rendered}
      </div>
      <section class="workspace-pane" id="workspace-pane">
        <div class="resize-handle" id="workspace-resize-handle" title="Resize workspace">
          <div class="resize-grip"></div>
        </div>
        <div class="tool-panel" id="tool-panel-pws-structure" hidden>
          <div class="pane-header">
            <div class="pane-title-block">
              <div class="side-title">Active Tool</div>
              <div class="pane-title">PWS Structure</div>
              <div class="pane-subtitle">Inspect the hierarchy and keep track of checked requirements.</div>
            </div>
            <div class="tool-chip" id="structure-selection-chip">0 selected</div>
          </div>
          <div class="pane-grid">
            <div class="pane-stack">
              <div class="source-card">
                <div class="side-title" style="padding:0;">Checked Requirements</div>
                <div class="results-list" id="structure-selected-requirements">
                  <div class="helper-text">Check requirements in the hierarchy</div>
                </div>
              </div>
            </div>
            <div class="pane-stack">
              <div class="results-card">
                <div class="pane-header" style="align-items:center;">
                  <div class="side-title" style="padding:0;">Workspace Summary</div>
                  <div class="tool-chip" id="structure-group-chip">0 groups</div>
                </div>
                <div class="group-list" id="structure-summary-list">
                  <div class="helper-text">No groups</div>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div class="tool-panel" id="tool-panel-requirement-search">
          <div class="pane-header">
            <div class="pane-title-block">
              <div class="side-title">Active Tool</div>
              <div class="pane-title">Requirement Search</div>
              <div class="pane-subtitle">Search and curate related requirements.</div>
            </div>
            <div class="tool-chip">Project: {_esc(project_id or "Not set")}</div>
          </div>
          <div class="pane-grid">
            <div class="pane-stack">
              <div class="source-card">
                <div class="side-title" style="padding:0;">Source Requirement</div>
                <div class="source-id" id="source-requirement-id">No selection</div>
                <div class="source-section" id="source-requirement-section">{_esc(project_id or "No project")}</div>
                <div class="source-text" id="source-requirement-text"></div>
                <div><button type="button" class="text-toggle" id="source-text-toggle" data-target="source-requirement-text" data-expanded="false" onclick="toggleTextExpansion(this)" style="display:none;">Read more</button></div>
              </div>
              <div class="search-card">
                <div class="side-title" style="padding:0;">Search Controls</div>
                <input id="requirement-query" class="search-input" type="text" placeholder="Search related requirements or use the source text" />
                <div class="search-actions">
                  <button type="button" id="run-search-button" class="primary" onclick="runRequirementSearch()" disabled>Search Related Requirements</button>
                  <button type="button" onclick="clearRequirementSelection()">Uncheck All</button>
                  <button type="button" onclick="clearRequirementSearch()">Clear</button>
                </div>
                <div class="helper-text" id="search-state-helper"></div>
              </div>
            </div>
            <div class="pane-stack">
              <div class="results-card">
                <div class="pane-header" style="align-items:center;">
                  <div class="side-title" style="padding:0;">Returned Related Requirements</div>
                  <div class="tool-chip" id="results-count-chip">0 results</div>
                </div>
                <div class="results-list" id="requirement-results">
                  <div class="helper-text">No results</div>
                </div>
              </div>
              <div class="selected-card">
                <div class="pane-header" style="align-items:center;">
                  <div class="side-title" style="padding:0;">Selected Related Requirements</div>
                  <div class="tool-chip" id="selected-count-chip">0 selected</div>
                </div>
                <div class="selected-list" id="selected-requirements">
                  <div class="helper-text">No selected requirements</div>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div class="tool-panel" id="tool-panel-solution-helper" hidden>
          <div class="pane-header">
            <div class="pane-title-block">
              <div class="side-title">Active Tool</div>
              <div class="pane-title">Solution Helper</div>
              <div class="pane-subtitle">Group checked requirements and start a shared solution approach.</div>
            </div>
            <div class="tool-chip" id="solution-selection-chip">0 selected</div>
          </div>
          <div class="pane-grid">
            <div class="pane-stack">
              <div class="source-card">
                <div class="side-title" style="padding:0;">Checked Requirements</div>
                <div class="results-list" id="solution-selected-requirements">
                  <div class="helper-text">Check requirements in the hierarchy</div>
                </div>
              </div>
              <div class="search-card">
                <div class="side-title" style="padding:0;">Create Subset</div>
                <input id="solution-group-name" class="search-input" type="text" placeholder="Subset name" />
                <textarea id="solution-group-notes" class="solution-textarea" placeholder="Shared solution notes"></textarea>
                <div class="search-actions">
                  <button type="button" class="primary" onclick="createSolutionGroup()">Create Subset</button>
                  <button type="button" onclick="clearRequirementSelection()">Uncheck All</button>
                  <button type="button" onclick="clearSolutionGroupDraft()">Clear</button>
                </div>
                <div class="helper-text" id="solution-group-helper"></div>
              </div>
            </div>
            <div class="pane-stack">
              <div class="results-card">
                <div class="pane-header" style="align-items:center;">
                  <div class="side-title" style="padding:0;">Solution Subsets</div>
                  <div class="tool-chip" id="solution-group-count-chip">0 groups</div>
                </div>
                <div class="group-list" id="solution-group-list">
                  <div class="helper-text">No groups</div>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div class="tool-panel" id="tool-panel-llm-companion" hidden>
          <div class="pane-header">
            <div class="pane-title-block">
              <div class="side-title">Active Tool</div>
              <div class="pane-title">LLM Companion</div>
              <div class="pane-subtitle">Use checked requirements as context. Search docs when needed, or draft a solution directly from the checked set.</div>
            </div>
            <div class="tool-chip" id="companion-selection-chip">0 selected</div>
          </div>
          <div class="companion-layout">
            <div class="companion-top-grid">
              <div class="search-card">
                <div class="side-title" style="padding:0;">Prompt</div>
                <select id="companion-persona" class="search-input">
                  <option value="solution_architect">Solution Architect</option>
                  <option value="proposal_manager">Proposal Manager</option>
                  <option value="technical_analyst">Technical Analyst</option>
                </select>
                <textarea id="companion-prompt" class="solution-textarea" placeholder="Ask a question or draft a shared solution for the checked requirements"></textarea>
                <div class="search-actions">
                  <button type="button" class="primary" onclick="runLLMCompanion('ask')">Search Docs + Answer</button>
                  <button type="button" onclick="runLLMCompanion('solution')">Draft from Checked</button>
                  <button type="button" onclick="clearCompanion()">Clear</button>
                </div>
                <div class="helper-text" id="companion-helper"></div>
              </div>
            </div>
            <div class="companion-answer-card">
              <div class="pane-header" style="align-items:center;">
                <div class="side-title" style="padding:0;">Companion Response</div>
                <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;">
                  <button type="button" onclick="attachCompanionResponse()">Attach Response</button>
                  <div class="tool-chip" id="companion-evidence-chip">0 evidence</div>
                </div>
              </div>
              <div class="companion-answer-body" id="companion-answer">No response</div>
            </div>
            <div class="selected-card">
              <div class="pane-header" style="align-items:center;">
                <div class="side-title" style="padding:0;">Evidence</div>
              </div>
              <div class="group-list" id="companion-evidence-list">
                <div class="helper-text">No evidence</div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  </div>
  <script>
    const PROJECT_ID = {json.dumps(project_id)};
    const INITIAL_LINKED_REQUIREMENTS = {json.dumps(initial_linked_requirements_by_source or {})};
    const INITIAL_SELECTED_REQUIREMENT_ID = {json.dumps(initial_selected_requirement_id)};
    const INITIAL_SELECTED_REQUIREMENT_IDS = {json.dumps(initial_selected_requirement_ids or [])};
    const INITIAL_ACTIVE_TOOL = {json.dumps(initial_active_tool or "requirement-search")};
    const INITIAL_SOLUTION_GROUPS = {json.dumps(initial_solution_groups or [])};
    const INITIAL_COMPANION_NOTES_BY_REQUIREMENT = {json.dumps(initial_companion_notes_by_requirement or {})};
    const WORKSPACE_ID = {json.dumps(workspace_id)};
    let activeTool = "requirement-search";
    let selectedRequirementId = null;
    let selectedRequirement = null;
    let selectedRequirementIds = [];
    function escapeHtml(value) {{
      return String(value || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
    }}

    function refreshSourceRequirement() {{
      const searchButton = document.getElementById("run-search-button");
      const stateHelper = document.getElementById("search-state-helper");
      const sourceToggle = document.getElementById("source-text-toggle");
      document.querySelectorAll(".requirement-node").forEach((el) => {{
        el.classList.toggle("selected-source", selectedRequirementIds.includes(el.dataset.requirementId));
        const checkbox = el.querySelector("input[type='checkbox']");
        if (checkbox) {{
          checkbox.checked = selectedRequirementIds.includes(el.dataset.requirementId);
        }}
      }});
      if (!selectedRequirement) {{
        document.getElementById("source-requirement-id").textContent = "No selection";
        document.getElementById("source-requirement-section").textContent = PROJECT_ID || "No project";
        document.getElementById("source-requirement-text").textContent = "";
        document.getElementById("source-requirement-text").classList.remove("expanded");
        sourceToggle.dataset.expanded = "false";
        sourceToggle.textContent = "Read more";
        sourceToggle.style.display = "none";
        document.getElementById("requirement-query").value = "";
        searchButton.disabled = true;
        stateHelper.textContent = "";
        return;
      }}
      document.getElementById("source-requirement-id").textContent = selectedRequirement.id;
      document.getElementById("source-requirement-section").textContent = selectedRequirement.section || (PROJECT_ID || "No project");
      document.getElementById("source-requirement-text").textContent = selectedRequirement.text;
      document.getElementById("source-requirement-text").classList.remove("expanded");
      sourceToggle.dataset.expanded = "false";
      sourceToggle.textContent = "Read more";
      sourceToggle.style.display = selectedRequirement.text ? "inline" : "none";
      document.getElementById("requirement-query").value = selectedRequirement.text;
      searchButton.disabled = !PROJECT_ID;
      stateHelper.textContent = PROJECT_ID ? "" : "No project";
    }}

    function buildSelectedRequirementFromNode(node) {{
      if (!node) {{
        return null;
      }}
      return {{
        id: node.dataset.requirementId || "",
        section: node.dataset.requirementSection || "",
        text: node.dataset.requirementText || "",
      }};
    }}

    function getCheckedRequirements() {{
      return selectedRequirementIds
        .map((id) => document.querySelector(".requirement-node[data-requirement-id='" + id + "']"))
        .filter(Boolean)
        .map((node) => buildSelectedRequirementFromNode(node))
        .filter((item) => item && item.text);
    }}

    function setActiveTool(toolName) {{
      activeTool = toolName;
      document.querySelectorAll("[id^='tool-panel-']").forEach((panel) => {{
        panel.hidden = panel.id !== "tool-panel-" + toolName;
      }});
      document.querySelectorAll("[id^='tool-nav-']").forEach((item) => {{
        item.classList.toggle("active", item.id === "tool-nav-" + toolName);
      }});
      refreshSolutionHelper();
      refreshCompanionPanel();
    }}

    function renderRequirementResults(results) {{
      document.getElementById("results-count-chip").textContent = String(results.length) + " result" + (results.length === 1 ? "" : "s");
      const container = document.getElementById("requirement-results");
      if (!results.length) {{
        container.innerHTML = "<div class='helper-text'>No results</div>";
        return;
      }}
      container.innerHTML = results.map((item) => (
        (() => {{
          const requirementId = escapeHtml(item.requirement_id || "");
          return (
        "<div class='result-row'>" +
          "<div class='result-head'>" +
            "<div>" +
              "<div class='result-section'>" + escapeHtml((item.filename || "") + " · " + (item.section_number || "") + " " + (item.section_heading || "")) + "</div>" +
            "</div>" +
            "<div class='result-score'>score " + escapeHtml(String(item.score || 0)) + "</div>" +
          "</div>" +
          "<div class='result-text' id='result-text-" + requirementId + "'>" + escapeHtml(item.requirement_text || "") + "</div>" +
          "<div><button type='button' class='text-toggle' data-target='result-text-" + requirementId + "' data-expanded='false' onclick='toggleTextExpansion(this)'>Read more</button></div>" +
          "<div class='helper-text'>" + escapeHtml(item.match_reason || "") + "</div>" +
          "<div><button type='button' data-requirement-id='" + requirementId + "' onclick='addRelatedRequirement(this.dataset.requirementId)'>Add to list</button></div>" +
        "</div>"
          );
        }})()
      )).join("");
    }}

    function renderSelectedRequirements() {{
      const container = document.getElementById("selected-requirements");
      const selected = selectedRequirementId
        ? ((window.__linkedRequirementsBySource || {{}})[selectedRequirementId] || [])
        : [];
      document.getElementById("selected-count-chip").textContent = String(selected.length) + " selected";
      if (!selected.length) {{
        container.innerHTML = "<div class='helper-text'>No selected requirements</div>";
        return;
      }}
      container.innerHTML = selected.map((item) => (
        (() => {{
          const requirementId = escapeHtml(item.requirement_id || "");
          return (
        "<div class='selected-row'>" +
          "<div class='selected-head'>" +
            "<div>" +
              "<div class='selected-section'>" + escapeHtml((item.filename || "") + " · " + (item.section_number || "") + " " + (item.section_heading || "")) + "</div>" +
            "</div>" +
            "<div><button type='button' data-requirement-id='" + requirementId + "' data-source-id='" + escapeHtml(selectedRequirementId || "") + "' onclick='removeRelatedRequirement(this.dataset.requirementId, this.dataset.sourceId)'>Remove</button></div>" +
          "</div>" +
          "<div class='selected-text' id='selected-text-" + requirementId + "'>" + escapeHtml(item.requirement_text || "") + "</div>" +
          "<div><button type='button' class='text-toggle' data-target='selected-text-" + requirementId + "' data-expanded='false' onclick='toggleTextExpansion(this)'>Read more</button></div>" +
        "</div>"
          );
        }})()
      )).join("");
    }}

    function toggleSourceRequirement(id, checked) {{
      const node = document.querySelector(".requirement-node[data-requirement-id='" + id + "']");
      if (!node) {{
        return;
      }}
      if (checked) {{
        if (!selectedRequirementIds.includes(id)) {{
          selectedRequirementIds.push(id);
        }}
      }} else {{
        selectedRequirementIds = selectedRequirementIds.filter((item) => item !== id);
      }}
      selectedRequirementId = selectedRequirementIds[0] || null;
      selectedRequirement = selectedRequirementId
        ? buildSelectedRequirementFromNode(document.querySelector(".requirement-node[data-requirement-id='" + selectedRequirementId + "']"))
        : null;
      if (selectedRequirementId && (!selectedRequirement || !selectedRequirement.text)) {{
        selectedRequirementIds = selectedRequirementIds.filter((item) => item !== selectedRequirementId);
        selectedRequirementId = selectedRequirementIds[0] || null;
        selectedRequirement = selectedRequirementId
          ? buildSelectedRequirementFromNode(document.querySelector(".requirement-node[data-requirement-id='" + selectedRequirementId + "']"))
          : null;
      }}
      window.__lastSearchResults = [];
      document.getElementById("requirement-results").innerHTML = "<div class='helper-text'>" + (selectedRequirement ? "Ready" : "No results") + "</div>";
      refreshSourceRequirement();
      renderSelectedRequirements();
      refreshSolutionHelper();
    }}

    async function runRequirementSearch() {{
      if (!selectedRequirement) {{
        document.getElementById("requirement-results").innerHTML = "<div class='helper-text'>Select a requirement</div>";
        return;
      }}
      if (!PROJECT_ID) {{
        document.getElementById("requirement-results").innerHTML = "<div class='helper-text'>No project</div>";
        return;
      }}
      const query = document.getElementById("requirement-query").value.trim() || selectedRequirement.text;
      document.getElementById("requirement-results").innerHTML = "<div class='helper-text'>Searching...</div>";
      try {{
        const response = await fetch("/v1/projects/" + encodeURIComponent(PROJECT_ID) + "/requirements/search-related", {{
          method: "POST",
          headers: {{ "Content-Type": "application/json" }},
          body: JSON.stringify({{
            source_text: selectedRequirement.text,
            source_filename: {json.dumps(filename)},
            query_text: query,
            limit: 12
          }})
        }});
        const payload = await response.json();
        if (!response.ok) {{
          throw new Error(payload.detail || "Search failed");
        }}
        renderRequirementResults(payload.results || []);
        window.__lastSearchResults = payload.results || [];
      }} catch (error) {{
        document.getElementById("requirement-results").innerHTML = "<div class='helper-text'>" + escapeHtml(error.message || "Search failed") + "</div>";
      }}
    }}

    function clearRequirementSearch() {{
      document.getElementById("requirement-query").value = "";
      document.getElementById("requirement-results").innerHTML = "<div class='helper-text'>No results</div>";
      document.getElementById("results-count-chip").textContent = "0 results";
      window.__lastSearchResults = [];
      refreshSourceRequirement();
    }}

    function clearRequirementSelection() {{
      selectedRequirementIds = [];
      selectedRequirementId = null;
      selectedRequirement = null;
      window.__lastSearchResults = [];
      document.getElementById("requirement-results").innerHTML = "<div class='helper-text'>No results</div>";
      document.getElementById("results-count-chip").textContent = "0 results";
      refreshSourceRequirement();
      renderSelectedRequirements();
      refreshSolutionHelper();
    }}

    async function saveWorkspace() {{
      const statusNode = document.getElementById("save-workspace-status");
      const nameField = document.getElementById("workspace-name-input");
      const workspaceName = (nameField.value || "").trim();
      statusNode.textContent = "Saving...";
      try {{
        const response = await fetch("/v1/pws/workspaces", {{
          method: "POST",
          headers: {{ "Content-Type": "application/json" }},
          body: JSON.stringify({{
            workspace_name: workspaceName || null,
            filename: {json.dumps(filename)},
            project_id: PROJECT_ID,
            outline: {json.dumps(outline)},
            linked_requirements_by_source: window.__linkedRequirementsBySource || {{}},
            selected_requirement_id: selectedRequirementId,
            selected_requirement_ids: selectedRequirementIds,
            active_tool: activeTool,
            solution_groups: window.__solutionGroups || [],
            companion_notes_by_requirement: window.__companionNotesByRequirement || {{}}
          }})
        }});
        const payload = await response.json();
        if (!response.ok) {{
          throw new Error(payload.detail || "Unable to save");
        }}
        if (payload.workspace_name && !workspaceName) {{
          nameField.value = payload.workspace_name;
        }}
        statusNode.textContent = "Saved";
      }} catch (error) {{
        statusNode.textContent = error.message || "Unable to save";
      }}
    }}

    function cleanNodeText(node) {{
      return (node && node.textContent ? node.textContent : "").replace(/\\s+/g, " ").trim();
    }}

    function cleanCompanionOutput(text) {{
      return String(text || "")
        .replace(/\\*\\*/g, "")
        .replace(/^\\s*[-*]\\s+/gm, "")
        .replace(/^\\s*#{1,6}\\s+/gm, "")
        .replace(/\\n{3,}/g, "\\n\\n");
    }}

    function collectHierarchyRows(container, level, rows, parentId) {{
      Array.from(container.children).forEach((child) => {{
        if (child.matches("details.section")) {{
          const summary = child.querySelector(":scope > summary");
          const label = cleanNodeText(summary);
          const nodeId = label;
          rows.push({{
            node_type: "section",
            level,
            parent_id: parentId || "",
            node_id: nodeId,
            label,
            text: "",
          }});
          const body = child.querySelector(":scope > .section-body");
          if (body) {{
            collectHierarchyRows(body, level + 1, rows, nodeId);
          }}
          return;
        }}
        if (child.matches(".solution-subset")) {{
          const summary = child.querySelector(":scope > summary");
          const label = cleanNodeText(summary);
          const nodeId = "subset:" + label;
          rows.push({{
            node_type: "subset",
            level,
            parent_id: parentId || "",
            node_id: nodeId,
            label,
            text: "",
          }});
          const body = child.querySelector(":scope > .solution-subset-body");
          if (body) {{
            collectHierarchyRows(body, level + 1, rows, nodeId);
          }}
          return;
        }}
        if (child.matches(".paragraph.requirement-node")) {{
          const idNode = child.querySelector(":scope > .para-head .para-id");
          const textNode = child.querySelector(":scope > .para-head .para-title-text");
          const nodeId = cleanNodeText(idNode);
          rows.push({{
            node_type: "requirement",
            level,
            parent_id: parentId || "",
            node_id: nodeId,
            label: nodeId,
            text: cleanNodeText(textNode),
          }});
          const relatedList = child.querySelector(":scope > .linked-related-list");
          if (relatedList) {{
            Array.from(relatedList.children).forEach((relatedChild, index) => {{
              const meta = relatedChild.querySelector(".linked-related-meta");
              const text = relatedChild.querySelector(".linked-related-text");
              rows.push({{
                node_type: "related_requirement",
                level: level + 1,
                parent_id: nodeId,
                node_id: nodeId + ":related:" + String(index + 1),
                label: cleanNodeText(meta),
                text: cleanNodeText(text),
              }});
            }});
          }}
          Array.from(child.children).forEach((nested) => {{
            if (nested.matches(".bullet")) {{
              rows.push({{
                node_type: "bullet",
                level: level + 1,
                parent_id: nodeId,
                node_id: nodeId + ":bullet:" + String(rows.length + 1),
                label: "",
                text: cleanNodeText(nested),
              }});
            }}
          }});
        }}
      }});
    }}

    async function exportHierarchyWorkbook() {{
      const rows = [];
      const root = document.querySelector(".hierarchy-shell");
      if (!root) {{
        return;
      }}
      collectHierarchyRows(root, 1, rows, "");
      const response = await fetch("/v1/pws/export/hierarchy", {{
        method: "POST",
        headers: {{ "Content-Type": "application/json" }},
        body: JSON.stringify({{
          filename: {json.dumps(filename)},
          rows
        }})
      }});
      if (!response.ok) {{
        return;
      }}
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "";
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    }}

    function addRelatedRequirement(id) {{
      if (!selectedRequirementId) {{
        return;
      }}
      window.__linkedRequirementsBySource = window.__linkedRequirementsBySource || {{}};
      window.__linkedRequirementsBySource[selectedRequirementId] = window.__linkedRequirementsBySource[selectedRequirementId] || [];
      if (window.__linkedRequirementsBySource[selectedRequirementId].some((item) => item.requirement_id === id)) {{
        return;
      }}
      const candidate = (window.__lastSearchResults || []).find((item) => item.requirement_id === id);
      if (!candidate) {{
        return;
      }}
      window.__linkedRequirementsBySource[selectedRequirementId].push(candidate);
      renderHierarchyRelatedRequirements(selectedRequirementId);
      renderSelectedRequirements();
    }}

    function removeRelatedRequirement(id, sourceId) {{
      const ownerId = sourceId || selectedRequirementId;
      if (!ownerId || !window.__linkedRequirementsBySource || !window.__linkedRequirementsBySource[ownerId]) {{
        return;
      }}
      window.__linkedRequirementsBySource[ownerId] = window.__linkedRequirementsBySource[ownerId].filter((item) => item.requirement_id !== id);
      renderHierarchyRelatedRequirements(ownerId);
      renderSelectedRequirements();
    }}

    function renderHierarchyRelatedRequirements(sourceId) {{
      const container = document.getElementById("linked-related-" + sourceId);
      if (!container) {{
        return;
      }}
      const items = ((window.__linkedRequirementsBySource || {{}})[sourceId] || []);
      if (!items.length) {{
        container.innerHTML = "";
        return;
      }}
      container.innerHTML = items.map((item) => {{
        const requirementId = escapeHtml(item.requirement_id || "");
        const sourceRequirementId = escapeHtml(sourceId || "");
        return (
          "<div class='linked-related-item'>" +
            "<div class='linked-related-head'>" +
              "<div>" +
                "<div class='linked-related-label'>Related requirement</div>" +
                "<div class='linked-related-meta'>" + escapeHtml((item.filename || "") + " · " + (item.section_number || "") + " " + (item.section_heading || "")) + "</div>" +
              "</div>" +
              "<button type='button' class='remove-related' data-requirement-id='" + requirementId + "' data-source-id='" + sourceRequirementId + "' onclick='removeRelatedRequirement(this.dataset.requirementId, this.dataset.sourceId)'>×</button>" +
            "</div>" +
            "<div class='linked-related-text' id='linked-text-" + sourceRequirementId + "-" + requirementId + "'>" + escapeHtml(item.requirement_text || "") + "</div>" +
            "<div><button type='button' class='text-toggle' data-target='linked-text-" + sourceRequirementId + "-" + requirementId + "' data-expanded='false' onclick='toggleTextExpansion(this)'>Read more</button></div>" +
          "</div>"
        );
      }}).join("");
    }}

    function renderCompanionNotesForRequirement(requirementId) {{
      const container = document.getElementById("linked-companion-" + requirementId);
      if (!container) {{
        return;
      }}
      const items = ((window.__companionNotesByRequirement || {{}})[requirementId] || []);
      if (!items.length) {{
        container.innerHTML = "";
        return;
      }}
      container.innerHTML = items.map((item, index) => (
        "<div class='linked-companion-item'>" +
          "<div class='linked-related-head'>" +
            "<div>" +
              "<div class='linked-companion-label'>" + escapeHtml(item.label || "Companion Note") + "</div>" +
            "</div>" +
            "<button type='button' class='remove-companion' data-requirement-id='" + escapeHtml(requirementId) + "' data-index='" + String(index) + "' onclick='removeCompanionNoteFromRequirement(this.dataset.requirementId, Number(this.dataset.index))'>×</button>" +
          "</div>" +
          "<div class='linked-companion-text'>" + escapeHtml(item.text || "") + "</div>" +
        "</div>"
      )).join("");
    }}

    function removeCompanionNoteFromRequirement(requirementId, index) {{
      const items = ((window.__companionNotesByRequirement || {{}})[requirementId] || []);
      items.splice(index, 1);
      window.__companionNotesByRequirement[requirementId] = items;
      renderCompanionNotesForRequirement(requirementId);
    }}

    function getActiveSubsetGroup() {{
      const selectedIds = [...selectedRequirementIds].sort();
      return (window.__solutionGroups || []).find((group) => {{
        const ids = Array.isArray(group.requirement_ids) ? [...group.requirement_ids].sort() : [];
        return ids.length === selectedIds.length && ids.every((id, index) => id === selectedIds[index]);
      }}) || null;
    }}

    function attachCompanionResponse() {{
      const answer = (document.getElementById("companion-answer").textContent || "").trim();
      const helper = document.getElementById("companion-helper");
      if (!answer || answer === "No response") {{
        helper.textContent = "No response to attach";
        return;
      }}
      const subsetGroup = getActiveSubsetGroup();
      if (subsetGroup) {{
        subsetGroup.companion_notes = subsetGroup.companion_notes || [];
        subsetGroup.companion_notes.push({{
          label: "Companion Response",
          text: answer,
        }});
        renderSolutionGroups();
        helper.textContent = "Attached to subset";
        return;
      }}
      if (selectedRequirementIds.length === 1) {{
        const requirementId = selectedRequirementIds[0];
        window.__companionNotesByRequirement = window.__companionNotesByRequirement || {{}};
        window.__companionNotesByRequirement[requirementId] = window.__companionNotesByRequirement[requirementId] || [];
        window.__companionNotesByRequirement[requirementId].push({{
          label: "Companion Response",
          text: answer,
        }});
        renderCompanionNotesForRequirement(requirementId);
        helper.textContent = "Attached to requirement";
        return;
      }}
      helper.textContent = "Select one requirement or a full subset";
    }}

    function resetSolutionSubsets() {{
      document.querySelectorAll(".solution-subset").forEach((subset) => {{
        const body = subset.querySelector(".solution-subset-body");
        const parent = subset.parentElement;
        if (!body || !parent) {{
          subset.remove();
          return;
        }}
        Array.from(body.children).forEach((child) => {{
          parent.insertBefore(child, subset);
        }});
        subset.remove();
      }});
      document.querySelectorAll(".requirement-node").forEach((node) => {{
        node.classList.remove("in-solution-group");
      }});
    }}

    function renderSolutionSubsets() {{
      resetSolutionSubsets();
      (window.__solutionGroups || []).forEach((group) => {{
        const ids = Array.isArray(group.requirement_ids) ? group.requirement_ids : [];
        if (!ids.length) {{
          return;
        }}
        const nodes = ids
          .map((requirementId) => document.querySelector(".requirement-node[data-requirement-id='" + requirementId + "']"))
          .filter(Boolean);
        if (!nodes.length) {{
          return;
        }}
        const parent = nodes[0].parentElement;
        if (!parent || nodes.some((node) => node.parentElement !== parent)) {{
          return;
        }}
        nodes.forEach((node) => node.classList.add("in-solution-group"));
        const subset = document.createElement("details");
        subset.className = "solution-subset";
        subset.open = true;
        const companionNotes = Array.isArray(group.companion_notes) ? group.companion_notes : [];
        subset.innerHTML =
          "<summary>" + escapeHtml(group.name || "Solution Subset") + "</summary>" +
          "<div class='solution-subset-body'>" +
            (companionNotes.length
              ? companionNotes.map((item, index) => (
                  "<div class='linked-companion-item'>" +
                    "<div class='linked-related-head'>" +
                      "<div><div class='linked-companion-label'>" + escapeHtml(item.label || "Companion Response") + "</div></div>" +
                      "<button type='button' class='remove-companion' data-group-id='" + escapeHtml(group.id || "") + "' data-index='" + String(index) + "' onclick='removeCompanionNoteFromGroup(this.dataset.groupId, Number(this.dataset.index))'>×</button>" +
                    "</div>" +
                    "<div class='linked-companion-text'>" + escapeHtml(item.text || "") + "</div>" +
                  "</div>"
                )).join("")
              : "") +
          "</div>";
        parent.insertBefore(subset, nodes[0]);
        const body = subset.querySelector(".solution-subset-body");
        nodes.forEach((node) => {{
          body.appendChild(node);
        }});
      }});
    }}

    function renderSolutionGroups() {{
      const groups = window.__solutionGroups || [];
      const container = document.getElementById("solution-group-list");
      document.getElementById("solution-group-count-chip").textContent = String(groups.length) + " group" + (groups.length === 1 ? "" : "s");
      if (!groups.length) {{
        container.innerHTML = "<div class='helper-text'>No groups</div>";
        renderSolutionSubsets();
        return;
      }}
      container.innerHTML = groups.map((group) => (
        "<div class='group-item'>" +
          "<div class='group-item-head'>" +
            "<div>" +
              "<div class='group-name'>" + escapeHtml(group.name || "Solution Group") + "</div>" +
              "<div class='group-meta'>" + escapeHtml(String((group.requirement_ids || []).length)) + " requirements · collapsed into one subset</div>" +
            "</div>" +
            "<button type='button' data-group-id='" + escapeHtml(group.id || "") + "' onclick='removeSolutionGroup(this.dataset.groupId)'>Remove</button>" +
          "</div>" +
          "<div class='group-meta'>" + escapeHtml((group.requirement_ids || []).join(", ")) + "</div>" +
          "<div class='group-notes'>" + escapeHtml(group.notes || "") + "</div>" +
        "</div>"
      )).join("");
      renderSolutionSubsets();
    }}

    function refreshStructurePanel() {{
      const selected = getCheckedRequirements();
      const groups = window.__solutionGroups || [];
      document.getElementById("structure-selection-chip").textContent = String(selected.length) + " selected";
      document.getElementById("structure-group-chip").textContent = String(groups.length) + " groups";
      const selectedContainer = document.getElementById("structure-selected-requirements");
      const summaryContainer = document.getElementById("structure-summary-list");
      selectedContainer.innerHTML = selected.length
        ? selected.map((item) => (
            "<div class='selected-row'>" +
              "<div class='selected-section'>" + escapeHtml(item.id + " · " + (item.section || "")) + "</div>" +
              "<div class='selected-text'>" + escapeHtml(item.text || "") + "</div>" +
            "</div>"
          )).join("")
        : "<div class='helper-text'>Check requirements in the hierarchy</div>";
      summaryContainer.innerHTML = groups.length
        ? groups.map((group) => (
            "<div class='group-item'>" +
              "<div class='group-name'>" + escapeHtml(group.name || "Solution Group") + "</div>" +
              "<div class='group-meta'>" + escapeHtml(String((group.requirement_ids || []).length)) + " requirements</div>" +
            "</div>"
          )).join("")
        : "<div class='helper-text'>No groups</div>";
    }}

    function refreshCompanionPanel() {{
      const selected = getCheckedRequirements();
      document.getElementById("companion-selection-chip").textContent = String(selected.length) + " selected";
    }}

    function refreshSolutionHelper() {{
      const selected = getCheckedRequirements();
      document.getElementById("solution-selection-chip").textContent = String(selected.length) + " selected";
      const container = document.getElementById("solution-selected-requirements");
      if (!selected.length) {{
        container.innerHTML = "<div class='helper-text'>Check requirements in the hierarchy</div>";
      }} else {{
        container.innerHTML = selected.map((item) => (
          "<div class='selected-row'>" +
            "<div class='selected-section'>" + escapeHtml(item.id + " · " + (item.section || "")) + "</div>" +
            "<div class='selected-text'>" + escapeHtml(item.text || "") + "</div>" +
          "</div>"
        )).join("");
      }}
      renderSolutionGroups();
      refreshStructurePanel();
      refreshCompanionPanel();
    }}

    function createSolutionGroup() {{
      const requirements = getCheckedRequirements();
      const helper = document.getElementById("solution-group-helper");
      if (!requirements.length) {{
        helper.textContent = "Select requirements first";
        return;
      }}
      const nodes = selectedRequirementIds
        .map((id) => document.querySelector(".requirement-node[data-requirement-id='" + id + "']"))
        .filter(Boolean);
      const parent = nodes[0] ? nodes[0].parentElement : null;
      if (!parent || nodes.some((node) => node.parentElement !== parent)) {{
        helper.textContent = "Select requirements from one section";
        return;
      }}
      const nameField = document.getElementById("solution-group-name");
      const notesField = document.getElementById("solution-group-notes");
      const groupName = nameField.value.trim();
      if (!groupName) {{
        helper.textContent = "Group name required";
        return;
      }}
      window.__solutionGroups = window.__solutionGroups || [];
      window.__solutionGroups.push({{
        id: "group-" + Date.now(),
        name: groupName,
        notes: notesField.value.trim(),
        requirement_ids: requirements.map((item) => item.id),
      }});
      helper.textContent = "Subset created";
      nameField.value = "";
      notesField.value = "";
      refreshSolutionHelper();
    }}

    function clearSolutionGroupDraft() {{
      document.getElementById("solution-group-name").value = "";
      document.getElementById("solution-group-notes").value = "";
      document.getElementById("solution-group-helper").textContent = "";
    }}

    function clearCompanion() {{
      document.getElementById("companion-prompt").value = "";
      document.getElementById("companion-helper").textContent = "";
      document.getElementById("companion-answer").textContent = "No response";
      document.getElementById("companion-evidence-chip").textContent = "0 evidence";
      document.getElementById("companion-evidence-list").innerHTML = "<div class='helper-text'>No evidence</div>";
    }}

    async function runLLMCompanion(mode) {{
      const checked = getCheckedRequirements();
      const helper = document.getElementById("companion-helper");
      const prompt = document.getElementById("companion-prompt").value.trim();
      const persona = document.getElementById("companion-persona").value || "solution_architect";
      const useProjectEvidence = mode !== "solution";
      if (!checked.length) {{
        helper.textContent = "Select requirements first";
        return;
      }}
      if (!prompt) {{
        helper.textContent = "Prompt required";
        return;
      }}
      helper.textContent = "Thinking...";
      try {{
        document.getElementById("companion-answer").textContent = "";
        document.getElementById("companion-evidence-chip").textContent = "0 evidence";
        document.getElementById("companion-evidence-list").innerHTML = "<div class='helper-text'>No evidence</div>";
        const response = await fetch("/v1/pws/llm-companion/stream", {{
          method: "POST",
          headers: {{ "Content-Type": "application/json" }},
          body: JSON.stringify({{
            project_id: useProjectEvidence ? (PROJECT_ID || null) : null,
            prompt,
            mode,
            persona,
            checked_requirements: checked,
            use_project_evidence: useProjectEvidence
          }})
        }});
        if (!response.ok) {{
          const payload = await response.json();
          throw new Error(payload.detail || "Companion failed");
        }}
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let eventType = "message";
        while (true) {{
          const {{ value, done }} = await reader.read();
          if (done) {{
            break;
          }}
          buffer += decoder.decode(value, {{ stream: true }});
          const parts = buffer.split("\\n\\n");
          buffer = parts.pop() || "";
          for (const part of parts) {{
            const lines = part.split("\\n");
            let data = "";
            eventType = "message";
            for (const line of lines) {{
              if (line.startsWith("event: ")) {{
                eventType = line.slice(7).trim();
              }} else if (line.startsWith("data: ")) {{
                data += line.slice(6);
              }}
            }}
            if (!data) {{
              continue;
            }}
            const payload = JSON.parse(data);
            if (eventType === "evidence") {{
              const evidence = Array.isArray(payload.evidence) ? payload.evidence : [];
              document.getElementById("companion-evidence-chip").textContent = String(evidence.length) + " evidence";
              document.getElementById("companion-evidence-list").innerHTML = evidence.length
                ? evidence.map((item) => (
                    "<div class='group-item'>" +
                      "<div class='group-name'>" + escapeHtml((item.filename || "") + " · " + ((item.section_number || item.section_path || "") + " " + (item.section_heading || "")).trim()) + "</div>" +
                      "<div class='group-notes'>" + escapeHtml(String(item.body_text || item.text || "")) + "</div>" +
                    "</div>"
                  )).join("")
                : "<div class='helper-text'>No evidence</div>";
            }} else if (eventType === "token") {{
              const answerNode = document.getElementById("companion-answer");
              answerNode.textContent = cleanCompanionOutput((answerNode.textContent || "") + (payload.delta || ""));
            }} else if (eventType === "error") {{
              throw new Error(payload.detail || "Companion failed");
            }}
          }}
        }}
        helper.textContent = "";
      }} catch (error) {{
        helper.textContent = error.message || "Companion failed";
      }}
    }}

    function removeSolutionGroup(groupId) {{
      window.__solutionGroups = (window.__solutionGroups || []).filter((group) => group.id !== groupId);
      refreshSolutionHelper();
    }}

    function removeCompanionNoteFromGroup(groupId, index) {{
      const group = (window.__solutionGroups || []).find((item) => item.id === groupId);
      if (!group) {{
        return;
      }}
      group.companion_notes = Array.isArray(group.companion_notes) ? group.companion_notes : [];
      group.companion_notes.splice(index, 1);
      renderSolutionGroups();
    }}

    function toggleTextExpansion(button) {{
      const targetId = button.dataset.target;
      const expanded = button.dataset.expanded === "true";
      const target = document.getElementById(targetId);
      if (!target) {{
        return;
      }}
      target.classList.toggle("expanded", !expanded);
      button.dataset.expanded = expanded ? "false" : "true";
      button.textContent = expanded ? "Read more" : "Show less";
    }}

    function setAll(openState) {{
      document.querySelectorAll('details.section').forEach((el) => {{
        el.open = openState;
      }});
    }}

    function initWorkspaceResize() {{
      const pane = document.getElementById("workspace-pane");
      const handle = document.getElementById("workspace-resize-handle");
      if (!pane || !handle) {{
        return;
      }}

      const storageKey = "perfect_pws_workspace_height";
      const minHeight = 220;
      const maxHeight = Math.min(Math.floor(window.innerHeight * 0.65), 720);
      const savedHeight = parseInt(window.localStorage.getItem(storageKey) || "", 10);
      if (!Number.isNaN(savedHeight)) {{
        pane.style.height = Math.max(minHeight, Math.min(maxHeight, savedHeight)) + "px";
      }}

      let startY = 0;
      let startHeight = 0;

      const onMove = (event) => {{
        const nextHeight = Math.max(
          minHeight,
          Math.min(maxHeight, startHeight - (event.clientY - startY))
        );
        pane.style.height = nextHeight + "px";
      }};

      const onUp = () => {{
        pane.classList.remove("resizing");
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
        window.localStorage.setItem(storageKey, String(parseInt(pane.style.height || "0", 10) || pane.offsetHeight));
      }};

      handle.addEventListener("mousedown", (event) => {{
        event.preventDefault();
        startY = event.clientY;
        startHeight = pane.offsetHeight;
        pane.classList.add("resizing");
        window.addEventListener("mousemove", onMove);
        window.addEventListener("mouseup", onUp);
      }});
    }}

    function restoreSavedWorkspaceState() {{
      window.__linkedRequirementsBySource = INITIAL_LINKED_REQUIREMENTS || {{}};
      window.__solutionGroups = INITIAL_SOLUTION_GROUPS || [];
      Object.keys(window.__linkedRequirementsBySource).forEach((sourceId) => {{
        renderHierarchyRelatedRequirements(sourceId);
      }});
      selectedRequirementIds = Array.isArray(INITIAL_SELECTED_REQUIREMENT_IDS) ? INITIAL_SELECTED_REQUIREMENT_IDS.slice() : [];
      if (!selectedRequirementIds.length && INITIAL_SELECTED_REQUIREMENT_ID) {{
        selectedRequirementIds = [INITIAL_SELECTED_REQUIREMENT_ID];
      }}
      selectedRequirementId = selectedRequirementIds[0] || null;
      selectedRequirement = selectedRequirementId
        ? buildSelectedRequirementFromNode(document.querySelector(".requirement-node[data-requirement-id='" + selectedRequirementId + "']"))
        : null;
      refreshSourceRequirement();
      renderSelectedRequirements();
      setActiveTool(INITIAL_ACTIVE_TOOL || "requirement-search");
      Object.keys(window.__companionNotesByRequirement || {{}}).forEach((requirementId) => {{
        renderCompanionNotesForRequirement(requirementId);
      }});
      refreshSolutionHelper();
    }}

    window.__linkedRequirementsBySource = {{}};
    window.__companionNotesByRequirement = INITIAL_COMPANION_NOTES_BY_REQUIREMENT || {{}};
    window.__solutionGroups = [];
    window.__lastSearchResults = [];
    restoreSavedWorkspaceState();
    initWorkspaceResize();
  </script>
</body>
</html>
"""
