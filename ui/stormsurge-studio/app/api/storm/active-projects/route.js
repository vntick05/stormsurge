export const runtime = "nodejs";

const normalizationServiceUrl =
  process.env.NORMALIZATION_SERVICE_URL || "http://normalization-service:8091";

export async function GET() {
  try {
    const response = await fetch(`${normalizationServiceUrl}/v1/projects`, {
      method: "GET",
      cache: "no-store",
    });

    const text = await response.text();
    return new Response(text, {
      status: response.status,
      headers: {
        "Content-Type": response.headers.get("content-type") || "application/json",
      },
    });
  } catch (error) {
    return Response.json(
      {
        projects: [],
        detail:
          error instanceof Error ? error.message : "Unable to load active projects",
      },
      { status: 502 },
    );
  }
}
