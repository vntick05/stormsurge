export const runtime = "nodejs";

const serviceUrl =
  process.env.PWS_STRUCTURING_SERVICE_URL || "http://pws-structuring-service:8193";

function buildConversationPrompt(messages, userPrompt, { useProjectEvidence = false } = {}) {
  const history = Array.isArray(messages)
    ? messages
        .filter(
          (message) =>
            message &&
            typeof message === "object" &&
            (message.role === "user" || message.role === "assistant") &&
            String(message.content || "").trim(),
        )
        .slice(-8)
    : [];

  const lines = [
    "You are the StormStudio AI Helper in the requirement tools sidebar.",
    "Respond conversationally, like a practical ChatGPT-style assistant for proposal work.",
    "Use the conversation history when it matters, but prioritize the latest request.",
    useProjectEvidence
      ? "A project is attached. Ground your answer in the uploaded project documents and other project evidence when relevant."
      : "No project evidence is attached, so rely on the request and visible requirement context only.",
    "",
    "Conversation history:",
  ];

  if (!history.length) {
    lines.push("[No prior conversation]");
  } else {
    history.forEach((message, index) => {
      const role = message.role === "assistant" ? "Assistant" : "User";
      lines.push(`${role} ${index + 1}: ${String(message.content).trim()}`);
    });
  }

  lines.push("");
  lines.push("Latest user request:");
  lines.push(String(userPrompt || "").trim());
  return lines.join("\n");
}

export async function POST(request) {
  const payload = await request.json().catch(() => null);
  const userPrompt = String(payload?.prompt || "").trim();
  const projectId = String(payload?.projectId || "").trim();
  const useProjectEvidence = Boolean(projectId);
  const selectedRequirement = payload?.selectedRequirement;
  const checkedRequirements = Array.isArray(payload?.checkedRequirements)
    ? payload.checkedRequirements
        .map((requirement) => ({
          id: String(requirement?.id || "").trim(),
          section: String(requirement?.section || "").trim() || null,
          text: String(requirement?.text || "").trim(),
        }))
        .filter((requirement) => requirement.id && requirement.text)
    : [];

  if (!userPrompt) {
    return Response.json({ detail: "prompt is required" }, { status: 400 });
  }

  const upstreamResponse = await fetch(`${serviceUrl}/v1/pws/llm-companion/stream`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      project_id: useProjectEvidence ? projectId : null,
      prompt: buildConversationPrompt(payload?.messages, userPrompt, { useProjectEvidence }),
      checked_requirements: checkedRequirements,
      mode: "ask",
      use_project_evidence: useProjectEvidence,
      persona: "proposal_manager",
      selected_requirement: selectedRequirement || null,
    }),
  });

  if (!upstreamResponse.ok || !upstreamResponse.body) {
    const text = await upstreamResponse.text().catch(() => "");
    let detail = "AI Helper request failed";

    try {
      const upstreamPayload = JSON.parse(text);
      detail = String(upstreamPayload?.detail || "").trim() || detail;
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
