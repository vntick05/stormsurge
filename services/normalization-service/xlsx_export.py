from io import BytesIO
from xml.sax.saxutils import escape
import zipfile


def _normalize_cell(value: object) -> object:
    if value is None:
        return None
    if isinstance(value, str):
        return value.replace("\r\n", "\n").replace("\r", "\n")
    return value


def _col_name(index: int) -> str:
    result = []
    value = index + 1
    while value > 0:
        value, remainder = divmod(value - 1, 26)
        result.append(chr(65 + remainder))
    return "".join(reversed(result))


def _sheet_xml(rows: list[list[object]]) -> str:
    row_xml: list[str] = []
    for row_index, row in enumerate(rows, start=1):
        cells: list[str] = []
        for col_index, value in enumerate(row):
            ref = f"{_col_name(col_index)}{row_index}"
            value = _normalize_cell(value)
            if value is None:
                continue
            if isinstance(value, (int, float)) and not isinstance(value, bool):
                cells.append(f'<c r="{ref}"><v>{value}</v></c>')
            else:
                text = escape(str(value))
                cells.append(f'<c r="{ref}" t="inlineStr"><is><t xml:space="preserve">{text}</t></is></c>')
        row_xml.append(f'<row r="{row_index}">{"".join(cells)}</row>')
    return (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
        f'<sheetData>{"".join(row_xml)}</sheetData>'
        "</worksheet>"
    )


def build_workbook(sheet_rows: list[tuple[str, list[dict[str, object]]]]) -> bytes:
    buffer = BytesIO()
    with zipfile.ZipFile(buffer, "w", compression=zipfile.ZIP_DEFLATED) as workbook:
        workbook.writestr(
            "[Content_Types].xml",
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
            '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
            '<Default Extension="xml" ContentType="application/xml"/>'
            '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
            + "".join(
                f'<Override PartName="/xl/worksheets/sheet{index}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
                for index in range(1, len(sheet_rows) + 1)
            )
            + "</Types>",
        )
        workbook.writestr(
            "_rels/.rels",
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
            '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>'
            "</Relationships>",
        )
        workbook.writestr(
            "xl/_rels/workbook.xml.rels",
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
            + "".join(
                f'<Relationship Id="rId{index}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet{index}.xml"/>'
                for index in range(1, len(sheet_rows) + 1)
            )
            + "</Relationships>",
        )
        workbook.writestr(
            "xl/workbook.xml",
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" '
            'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
            "<sheets>"
            + "".join(
                f'<sheet name="{escape(name[:31])}" sheetId="{index}" r:id="rId{index}"/>'
                for index, (name, _) in enumerate(sheet_rows, start=1)
            )
            + "</sheets></workbook>",
        )
        for index, (_, rows) in enumerate(sheet_rows, start=1):
            headers = list(rows[0].keys()) if rows else []
            values = [headers] + [[row.get(header) for header in headers] for row in rows]
            workbook.writestr(f"xl/worksheets/sheet{index}.xml", _sheet_xml(values))
    return buffer.getvalue()


def _split_section_content(body_text: str) -> list[str]:
    normalized = (body_text or "").replace("\r\n", "\n").replace("\r", "\n")
    parts = [part.strip() for part in normalized.split("\n\n")]
    return [part for part in parts if part]


def _section_display(section: dict[str, object]) -> str:
    number = str(section.get("section_number") or "").strip()
    title = str(section.get("section_title") or "").strip()
    if number and title:
        return f"{number} {title}"
    return number or title or str(section.get("heading_path") or "")


def _section_chain(
    section: dict[str, object],
    by_id: dict[str, dict[str, object]],
) -> list[dict[str, object]]:
    chain: list[dict[str, object]] = []
    current = section
    while current:
        chain.append(current)
        parent_id = current.get("parent_section_record_id")
        current = by_id.get(str(parent_id)) if parent_id else None
    chain.reverse()
    return chain


def build_pws_hierarchy_rows(payload: dict[str, object]) -> list[dict[str, object]]:
    extract = payload.get("pws_extract") if "pws_extract" in payload else payload
    sections = list(extract.get("sections", []))
    tables = list(extract.get("tables", []))
    by_id = {str(section["section_record_id"]): section for section in sections}
    tables_by_heading: dict[str, list[str]] = {}
    for table in tables:
        heading_path = str(table.get("heading_path") or table.get("section_path") or "")
        table_text = str(table.get("normalized_text") or table.get("body_text") or "").strip()
        if heading_path and table_text:
            tables_by_heading.setdefault(heading_path, []).append(table_text)

    rows: list[dict[str, object]] = []
    for section in sections:
        chain = _section_chain(section, by_id)
        labels = [_section_display(item) for item in chain[:4]]
        content_items = _split_section_content(str(section.get("body_text_exact") or ""))
        heading_path = str(section.get("heading_path") or "")
        content_items.extend(tables_by_heading.get(heading_path, []))
        if not content_items:
            content_items = [""]
        for item in content_items:
            rows.append(
                {
                    "Level 1": labels[0] if len(labels) > 0 else "",
                    "Level 2": labels[1] if len(labels) > 1 else "",
                    "Level 3": labels[2] if len(labels) > 2 else "",
                    "Level 4": labels[3] if len(labels) > 3 else "",
                    "Content": item,
                    "Summary": "",
                }
            )
    return rows


def build_pws_hierarchy_workbook(payload: dict[str, object]) -> bytes:
    return build_workbook([("PWS Hierarchy", build_pws_hierarchy_rows(payload))])
