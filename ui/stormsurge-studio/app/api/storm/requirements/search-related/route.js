export const runtime = "nodejs";

const normalizationServiceUrl =
  process.env.NORMALIZATION_SERVICE_URL || "http://normalization-service:8091";
const pwsStructuringServiceUrl =
  process.env.PWS_STRUCTURING_SERVICE_URL || "http://pws-structuring-service:8193";

function extractJsonBlock(text) {
  const raw = String(text || "").trim();
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw);
  } catch {}

  const fencedMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fencedMatch) {
    try {
      return JSON.parse(fencedMatch[1].trim());
    } catch {}
  }

  const firstBrace = raw.indexOf("{");
  const lastBrace = raw.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    try {
      return JSON.parse(raw.slice(firstBrace, lastBrace + 1));
    } catch {}
  }

  return null;
}

function buildLlmPrompt(sourceText, candidates) {
  const candidateLines = candidates.map((candidate, index) => {
    const section = String(candidate?.section_number || candidate?.section_heading || "").trim();
    const reason = String(candidate?.match_reason || "").trim();
    const text = String(candidate?.requirement_text || "").trim();
    return [
      `Candidate ${index + 1}`,
      `requirement_id: ${candidate.requirement_id}`,
      `section: ${section || "unknown"}`,
      `match_reason: ${reason || "n/a"}`,
      `text: ${text}`,
    ].join("\n");
  });

  return [
    "You are filtering requirement relationships for proposal analysis.",
    "Decide which candidate requirements are highly relevant to the selected requirement.",
    "Only keep real, strong relationships such as shared technical dependency, direct interface/control linkage, required coordination, same deliverable flow, or obvious evaluator-coupled execution risk.",
    "Reject weak topical overlap, generic program language, or loose semantic similarity.",
    "Return JSON only.",
    'Use this exact shape: {"results":[{"requirement_id":"...","reason":"...","confidence":"high"}]}',
    "Do not include any candidate unless it is highly relevant.",
    "",
    "Selected requirement:",
    sourceText,
    "",
    "Candidates:",
    candidateLines.join("\n\n"),
  ].join("\n");
}

export async function POST(request) {
  const payload = await request.json().catch(() => null);
  const projectId = String(payload?.projectId || "").trim();
  const sourceText = String(payload?.sourceText || "").trim();
  const sourceFilename = String(payload?.sourceFilename || "").trim();

  if (!projectId) {
    return Response.json({ detail: "projectId is required" }, { status: 400 });
  }

  if (!sourceText) {
    return Response.json({ detail: "sourceText is required" }, { status: 400 });
  }

  try {
    const candidateResponse = await fetch(
      `${normalizationServiceUrl}/v1/projects/${encodeURIComponent(projectId)}/requirements/search-related`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source_text: sourceText,
          query_text: String(payload?.queryText || "").trim() || sourceText,
          source_filename: sourceFilename || null,
          limit: 18,
        }),
        cache: "no-store",
      }
    );
    const candidatePayload = await candidateResponse.json().catch(() => null);
    if (!candidateResponse.ok) {
      throw new Error(candidatePayload?.detail || "Candidate related-requirement search failed");
    }

    const candidates = Array.isArray(candidatePayload?.results) ? candidatePayload.results : [];
    if (!candidates.length) {
      return Response.json({
        project_id: projectId,
        count: 0,
        results: [],
      });
    }

    const llmResponse = await fetch(`${pwsStructuringServiceUrl}/v1/pws/llm-companion`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        project_id: null,
        prompt: buildLlmPrompt(sourceText, candidates),
        checked_requirements: [
          {
            id: "selected-requirement",
            section: null,
            text: sourceText,
          },
        ],
        mode: "ask",
        use_project_evidence: false,
        persona: "solution_architect",
      }),
      cache: "no-store",
    });
    const llmPayload = await llmResponse.json().catch(() => null);
    if (!llmResponse.ok) {
      throw new Error(llmPayload?.detail || "AI relevance filter failed");
    }

    const parsed = extractJsonBlock(llmPayload?.answer);
    const selectedIds = new Map(
      (Array.isArray(parsed?.results) ? parsed.results : [])
        .filter((item) => String(item?.confidence || "").trim().toLowerCase() === "high")
        .map((item) => [
          String(item?.requirement_id || "").trim(),
          String(item?.reason || "").trim(),
        ])
        .filter(([id]) => id)
    );

    const filteredResults = candidates
      .filter((candidate) => selectedIds.has(String(candidate?.requirement_id || "").trim()))
      .map((candidate) => ({
        ...candidate,
        match_reason:
          selectedIds.get(String(candidate?.requirement_id || "").trim()) ||
          candidate?.match_reason ||
          "Highly relevant relationship",
      }));

    return Response.json({
      project_id: projectId,
      count: filteredResults.length,
      results: filteredResults,
    });
  } catch (error) {
    return Response.json(
      {
        detail:
          error instanceof Error ? error.message : "AI-related requirement search failed",
      },
      { status: 502 }
    );
  }
}
