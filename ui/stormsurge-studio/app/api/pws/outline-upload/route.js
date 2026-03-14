export const runtime = "nodejs";

const serviceUrl =
  process.env.PWS_STRUCTURING_SERVICE_URL || "http://pws-structuring-service:8193";

export async function POST(request) {
  const formData = await request.formData();
  const file = formData.get("file");
  const projectId = String(formData.get("projectId") || "").trim();

  if (!(file instanceof File)) {
    return Response.json({ detail: "file is required" }, { status: 400 });
  }

  const upstreamFormData = new FormData();
  upstreamFormData.append("file", file, file.name);
  if (projectId) {
    upstreamFormData.append("project_id", projectId);
  }

  const response = await fetch(`${serviceUrl}/v1/pws/outline/upload`, {
    method: "POST",
    body: upstreamFormData,
  });

  const text = await response.text();

  try {
    return new Response(text, {
      status: response.status,
      headers: {
        "Content-Type": response.headers.get("content-type") || "application/json",
      },
    });
  } catch {
    return Response.json({ detail: "Upstream response was invalid" }, { status: 502 });
  }
}
