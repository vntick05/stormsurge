export const runtime = "nodejs";

const serviceUrl =
  process.env.PWS_STRUCTURING_SERVICE_URL || "http://pws-structuring-service:8193";

function buildPrompt(sectionLabel) {
  const scopedSection = String(sectionLabel || "this section").trim();
  return [
    `Draft an MTS Definition for ${scopedSection}.`,
    "MTS means Meets the Standard.",
    "Read the requirements as a group.",
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
    "Do not mention source metadata, internal tooling, or the phrase 'Meets the Standard' in the response body.",
  ].join(" ");
}

export async function POST(request) {
  const payload = await request.json().catch(() => null);
  const sectionLabel = payload?.sectionLabel;
  const requirements = Array.isArray(payload?.requirements) ? payload.requirements : [];

  if (!requirements.length) {
    return Response.json({ detail: "requirements are required" }, { status: 400 });
  }

  const checkedRequirements = requirements
    .map((requirement) => ({
      id: String(requirement?.id || "").trim(),
      section: String(requirement?.section || "").trim() || null,
      text: String(requirement?.text || "").trim(),
    }))
    .filter((requirement) => requirement.id && requirement.text);

  if (!checkedRequirements.length) {
    return Response.json(
      { detail: "requirements must include id and text" },
      { status: 400 },
    );
  }

  const upstreamResponse = await fetch(`${serviceUrl}/v1/pws/llm-companion`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      prompt: buildPrompt(sectionLabel),
      checked_requirements: checkedRequirements,
      mode: "ask",
      use_project_evidence: false,
      persona: "proposal_manager",
    }),
  });

  const text = await upstreamResponse.text();

  try {
    const upstreamPayload = JSON.parse(text);
    if (!upstreamResponse.ok) {
      const upstreamDetail = String(upstreamPayload?.detail || "").trim();
      return Response.json(
        {
          detail:
            upstreamDetail === "Internal Server Error"
              ? "The MTS definition service is reachable, but the LLM backend behind it is not available right now."
              : upstreamDetail || "MTS definition generation failed",
        },
        { status: upstreamResponse.status },
      );
    }

    return Response.json(
      {
        definition: String(upstreamPayload?.answer || "").trim(),
      },
      { status: 200 },
    );
  } catch {
    return Response.json(
      { detail: "The MTS definition service returned an invalid response." },
      { status: upstreamResponse.ok ? 502 : upstreamResponse.status },
    );
  }
}
