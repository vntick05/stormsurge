export const runtime = "nodejs";

const serviceUrl =
  process.env.PWS_STRUCTURING_SERVICE_URL || "http://pws-structuring-service:8193";
const MAX_REQUIREMENT_COUNT = 16;
const MAX_REQUIREMENT_TEXT_CHARS = 180;
const MAX_TOTAL_REQUIREMENT_TEXT_CHARS = 2200;

function cleanRequirementText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function truncateText(value, limit) {
  if (value.length <= limit) {
    return value;
  }
  return `${value.slice(0, Math.max(0, limit - 3)).trimEnd()}...`;
}

function compactRequirements(requirements) {
  const compacted = [];
  let totalChars = 0;

  for (const requirement of requirements) {
    if (compacted.length >= MAX_REQUIREMENT_COUNT) {
      break;
    }

    const id = String(requirement?.id || "").trim();
    const section = String(requirement?.section || "").trim() || null;
    const text = truncateText(
      cleanRequirementText(requirement?.text),
      MAX_REQUIREMENT_TEXT_CHARS,
    );

    if (!id || !text) {
      continue;
    }

    if (totalChars >= MAX_TOTAL_REQUIREMENT_TEXT_CHARS) {
      break;
    }

    const remainingChars = MAX_TOTAL_REQUIREMENT_TEXT_CHARS - totalChars;
    const finalText =
      text.length > remainingChars ? truncateText(text, remainingChars) : text;

    if (!finalText) {
      break;
    }

    compacted.push({ id, section, text: finalText });
    totalChars += finalText.length;
  }

  return compacted;
}

function buildPrompt(sectionLabel) {
  const scopedSection = String(sectionLabel || "this section").trim();
  return [
    `Draft an MTS Definition for ${scopedSection}.`,
    "MTS means Meets the Standard.",
    "Read the requirements as a group.",
    "Treat the checked requirements in this request as the full working requirement set for the response.",
    "Identify the common baseline expectation across them.",
    "Define the minimum credible, compliant, and executable approach.",
    "Focus on what would make a government evaluator conclude the offeror understands the work and can perform it with acceptable risk.",
    "Include expected elements such as approach, process, staffing, tools, governance, deliverables, and performance controls only if they are clearly implied by the requirements.",
    "Do not write strengths, discriminators, or win themes.",
    "Do not just restate the requirements.",
    "Do not use marketing language.",
    "Write in practical evaluator-facing language.",
    "Use 2 to 3 short paragraphs.",
    "Do not use headings, bullets, markdown emphasis, or labels.",
    "Do not mention requirement counts, source expansion limits, hidden context, or that additional information could be retrieved later.",
    "Do not mention source metadata, internal tooling, or the phrase 'Meets the Standard' in the response body.",
  ].join(" ");
}

export async function POST(request) {
  const payload = await request.json().catch(() => null);
  const sectionLabel = payload?.sectionLabel;
  const customPrompt = String(payload?.prompt || "").trim();
  const requirements = Array.isArray(payload?.requirements) ? payload.requirements : [];

  if (!requirements.length) {
    return Response.json({ detail: "requirements are required" }, { status: 400 });
  }

  const checkedRequirements = compactRequirements(requirements);

  if (!checkedRequirements.length) {
    return Response.json(
      { detail: "requirements must include id and text" },
      { status: 400 },
    );
  }

  const upstreamResponse = await fetch(`${serviceUrl}/v1/pws/llm-companion/stream`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      prompt: customPrompt || buildPrompt(sectionLabel),
      checked_requirements: checkedRequirements,
      mode: "ask",
      use_project_evidence: false,
      persona: "proposal_manager",
    }),
  });

  if (!upstreamResponse.ok || !upstreamResponse.body) {
    const text = await upstreamResponse.text().catch(() => "");
    let detail = "MTS definition generation failed";

    try {
      const upstreamPayload = JSON.parse(text);
      const upstreamDetail = String(upstreamPayload?.detail || "").trim();
      detail =
        upstreamDetail === "Internal Server Error"
          ? "The MTS definition service is reachable, but the LLM backend behind it is not available right now."
          : upstreamDetail || detail;
    } catch {
      if (text.trim()) {
        detail = text.trim();
      }
    }

    return Response.json({ detail }, { status: upstreamResponse.status || 502 });
  }

  return new Response(upstreamResponse.body, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
