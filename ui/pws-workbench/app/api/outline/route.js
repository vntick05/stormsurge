const DEFAULT_SERVICE_URL = "http://127.0.0.1:8193";

export async function POST(request) {
  const serviceBaseUrl = process.env.PWS_SERVICE_URL || DEFAULT_SERVICE_URL;
  const formData = await request.formData();

  const response = await fetch(`${serviceBaseUrl}/v1/pws/outline/upload`, {
    method: "POST",
    body: formData,
    cache: "no-store",
  });

  const contentType = response.headers.get("content-type") || "";
  const payload = contentType.includes("application/json")
    ? await response.json()
    : { detail: await response.text() };

  return new Response(JSON.stringify(payload), {
    status: response.status,
    headers: {
      "content-type": "application/json",
    },
  });
}
