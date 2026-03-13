#!/usr/bin/env python3
import json
import html
import sys
from pathlib import Path
from typing import Any


def load_outline(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text())


def esc(value: str) -> str:
    return html.escape(value, quote=True)


def render_node(node: dict[str, Any]) -> str:
    if node.get("type") == "paragraph":
        body = esc(node.get("text_exact", ""))
        children = "".join(render_node(child) for child in node.get("children", []))
        return (
            f"<div class='paragraph'>"
            f"<div class='para-id'>{esc(node.get('id', ''))}</div>"
            f"<div class='para-text'>{body}</div>"
            f"{children}</div>"
        )
    if node.get("type") == "bullet":
        body = esc(node.get("text_exact", ""))
        return (
            f"<div class='bullet'>"
            f"<span class='bullet-id'>{esc(node.get('id', ''))}</span>"
            f"<span class='bullet-text'>{body}</span>"
            f"</div>"
        )

    title = f"{node.get('section_number', '')} {node.get('section_title', '')}".strip()
    children = "".join(render_node(child) for child in node.get("children", []))
    return (
        f"<details class='section' open>"
        f"<summary>{esc(title)}</summary>"
        f"<div class='section-body'>{children}</div>"
        f"</details>"
    )


def build_html(payload: dict[str, Any]) -> str:
    root_sections = payload.get("root_sections", [])
    rendered = "".join(render_node(node) for node in root_sections)
    return f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Perfect PWS Extract</title>
  <style>
    :root {{
      --bg: #f4efe6;
      --paper: #fffdf8;
      --ink: #1f1a17;
      --muted: #6f6257;
      --line: #d7cab9;
      --accent: #9a3412;
    }}
    * {{ box-sizing: border-box; }}
    body {{
      margin: 0;
      font-family: Georgia, "Times New Roman", serif;
      color: var(--ink);
      background:
        radial-gradient(circle at top left, #efe2cf 0, transparent 32%),
        linear-gradient(180deg, #f8f3eb 0, var(--bg) 100%);
    }}
    .wrap {{
      max-width: 1100px;
      margin: 0 auto;
      padding: 32px 20px 64px;
    }}
    .hero {{
      padding: 24px 28px;
      background: rgba(255,253,248,.9);
      border: 1px solid var(--line);
      border-radius: 18px;
      box-shadow: 0 12px 40px rgba(60, 35, 10, .08);
      margin-bottom: 24px;
    }}
    h1 {{
      margin: 0 0 8px;
      font-size: clamp(28px, 4vw, 48px);
      line-height: 1;
      letter-spacing: -.02em;
    }}
    .sub {{
      margin: 0;
      color: var(--muted);
      font-size: 16px;
    }}
    .toolbar {{
      display: flex;
      gap: 12px;
      margin-top: 16px;
      flex-wrap: wrap;
    }}
    button {{
      border: 1px solid var(--line);
      background: var(--paper);
      color: var(--ink);
      padding: 10px 14px;
      border-radius: 999px;
      cursor: pointer;
      font: inherit;
    }}
    .section {{
      background: rgba(255,253,248,.92);
      border: 1px solid var(--line);
      border-radius: 16px;
      margin: 14px 0;
      overflow: hidden;
    }}
    summary {{
      list-style: none;
      cursor: pointer;
      padding: 16px 18px;
      font-size: 22px;
      font-weight: 700;
      border-bottom: 1px solid transparent;
    }}
    details[open] > summary {{
      border-bottom-color: var(--line);
      background: linear-gradient(90deg, rgba(154,52,18,.08), transparent);
    }}
    .section-body {{
      padding: 8px 16px 16px;
    }}
    .paragraph {{
      margin: 12px 0;
      padding: 14px 16px;
      border-left: 4px solid #d6b48a;
      background: #fffaf2;
      border-radius: 8px;
    }}
    .para-id, .bullet-id {{
      color: var(--accent);
      font-size: 12px;
      font-weight: 700;
      letter-spacing: .04em;
      text-transform: uppercase;
      margin-bottom: 6px;
      display: inline-block;
    }}
    .para-text {{
      line-height: 1.5;
      font-size: 18px;
    }}
    .bullet {{
      margin: 8px 0 0 18px;
      padding: 10px 12px;
      border: 1px solid #eadbc7;
      background: #fffcf7;
      border-radius: 8px;
      line-height: 1.45;
    }}
    .bullet-text {{
      display: block;
      margin-top: 4px;
    }}
    @media (max-width: 720px) {{
      .wrap {{ padding: 18px 12px 40px; }}
      summary {{ font-size: 18px; }}
      .para-text {{ font-size: 16px; }}
    }}
  </style>
</head>
<body>
  <div class="wrap">
    <section class="hero">
      <h1>Perfect PWS Extract</h1>
      <p class="sub">Whole-document hierarchy view. Top level sections, nested subsections, paragraphs, and bullets.</p>
      <div class="toolbar">
        <button onclick="setAll(true)">Expand All</button>
        <button onclick="setAll(false)">Collapse All</button>
      </div>
    </section>
    {rendered}
  </div>
  <script>
    function setAll(openState) {{
      document.querySelectorAll('details.section').forEach((el) => {{
        el.open = openState;
      }});
    }}
  </script>
</body>
</html>
"""


def main() -> int:
    if len(sys.argv) != 3:
        print("usage: render_pws_html.py <simple-pws-outline.json> <output.html>", file=sys.stderr)
        return 2
    source_path = Path(sys.argv[1]).resolve()
    output_path = Path(sys.argv[2]).resolve()
    payload = load_outline(source_path)
    output_path.write_text(build_html(payload))
    print(output_path)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
