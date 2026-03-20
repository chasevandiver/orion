/**
 * GET /api/goals/[id]/war-room-stream
 *
 * Server-Sent Events route that polls the Express backend for pipeline status
 * and streams stage updates to the War Room client component.
 *
 * Events emitted:
 *   event: stage_update      data: { stage, status, stagesComplete }
 *   event: pipeline_complete  data: { campaignId, assetsCount }
 *   event: pipeline_error     data: { message, errorStage }
 *   event: error              data: { message }   (transient; stream stays open)
 *
 * Closes automatically:
 *   - After pipeline_complete (stage >= 5 or status === "complete")
 *   - After pipeline_error (pipelineError field is set)
 *   - After 10-minute server-side timeout
 *   - On client disconnect (req.signal abort)
 */

import { auth } from "@/lib/auth";
import { NextRequest } from "next/server";

const EXPRESS_URL = process.env.INTERNAL_API_URL ?? "http://localhost:3001";
const POLL_INTERVAL_MS = 2000;
const MAX_DURATION_MS = 10 * 60 * 1000; // 10 minutes

interface PipelineStatus {
  stage: number;
  status: string;
  stagesComplete: string[];
  campaignId?: string | null;
  campaign?: { id: string; name: string; status: string } | null;
  assetCount?: number;
  pipelineError?: string | null;
  pipelineStage?: string | null;
}

function encodeSSE(event: string, data: unknown): Uint8Array {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  return new TextEncoder().encode(payload);
}

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
): Promise<Response> {
  const session = await auth();

  if (!session?.user) {
    return new Response("Unauthorized", { status: 401 });
  }

  const user = session.user as { id: string; orgId?: string; role?: string };
  const goalId = params.id;

  const stream = new ReadableStream({
    async start(controller) {
      const startTime = Date.now();
      let done = false;

      function enqueue(event: string, data: unknown): boolean {
        try {
          controller.enqueue(encodeSSE(event, data));
          return true;
        } catch {
          return false;
        }
      }

      function close() {
        done = true;
        try { controller.close(); } catch { /* already closed */ }
      }

      async function fetchPipelineStatus(): Promise<PipelineStatus | null> {
        try {
          const res = await fetch(`${EXPRESS_URL}/goals/${goalId}/pipeline-status`, {
            method: "GET",
            headers: {
              "Content-Type": "application/json",
              "x-user-id": user.id ?? "",
              "x-org-id": user.orgId ?? "",
              "x-user-role": user.role ?? "member",
            },
          });
          if (!res.ok) return null;
          return (await res.json()) as PipelineStatus;
        } catch {
          return null;
        }
      }

      async function poll() {
        while (!done) {
          // Enforce server-side 10-minute timeout
          if (Date.now() - startTime > MAX_DURATION_MS) {
            close();
            break;
          }

          const status = await fetchPipelineStatus();

          if (!status) {
            // Transient fetch failure — emit error but keep polling
            if (!enqueue("error", { message: "Failed to fetch pipeline status" })) {
              done = true;
              break;
            }
          } else {
            // Pipeline error — emit event and terminate the stream
            if (status.pipelineError) {
              enqueue("pipeline_error", {
                message: status.pipelineError,
                errorStage: status.pipelineStage ?? null,
              });
              close();
              break;
            }

            // Emit current stage snapshot
            if (!enqueue("stage_update", {
              stage: status.stage,
              status: status.status,
              stagesComplete: status.stagesComplete ?? [],
            })) {
              done = true;
              break;
            }

            // Pipeline complete — emit completion event and terminate
            const isComplete =
              status.stage >= 5 || status.status === "complete";

            if (isComplete) {
              enqueue("pipeline_complete", {
                campaignId: status.campaignId ?? status.campaign?.id ?? null,
                assetsCount: status.assetCount ?? 0,
              });
              close();
              break;
            }
          }

          // Wait before next poll
          await new Promise<void>((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
        }
      }

      // Terminate cleanly on client disconnect
      req.signal.addEventListener("abort", () => close());

      poll().catch(() => close());
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
