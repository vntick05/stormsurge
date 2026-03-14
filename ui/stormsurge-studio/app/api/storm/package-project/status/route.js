export const runtime = "nodejs";

import { getPackageProjectJob } from "@/lib/package-project-jobs";

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const jobId = String(searchParams.get("jobId") || "").trim();

  if (!jobId) {
    return Response.json({ detail: "jobId is required" }, { status: 400 });
  }

  const job = await getPackageProjectJob(jobId);
  if (!job) {
    return Response.json({ detail: "Job not found" }, { status: 404 });
  }

  return Response.json(job);
}
