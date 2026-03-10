/**
 * GET /api/goals/[id]/war-room-stream
 *
 * Server-Sent Events route that polls the Express backend for pipeline status
 * and streams stage updates to the War Room client component.
 *
 * Events emitted:
 *   event: stage_update   data: { stage, status, stagesComplete }
 *   event: pipeline_complete  data: { campaignId, assetsCount }
 *   event: error          data: { message }
 *
 * Closes automatically:
 *   - After pipeline_complete (stage >= 5 or status === "complete")
 *   - After 10-minute timeout
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
  // Express returns campaign as { id, name, status } — campaignId at top level is also included
  campaignId?: string | null;
  campaign?: { id: string; name: string; status: string } | null;
  assetCount?: number;
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
          // Express returns the status object directly (no { data: ... } wrapper)
          const json = (await res.json()) as PipelineStatus;
          return json ?? null;
        } catch {
          return null;
        }
      }

      async function poll() {
        while (!done) {
          // Check timeout
          if (Date.now() - startTime > MAX_DURATION_MS) {
            controller.close();
            done = true;
            break;
          }

          const status = await fetchPipelineStatus();

          if (!status) {
            // Emit an error event but keep polling
            try {
              controller.enqueue(
                encodeSSE("error", { message: "Failed to fetch pipeline status" })
              );
            } catch {
              done = true;
              break;
            }
          } else {
            // Emit stage_update
            try {
              controller.enqueue(
                encodeSSE("stage_update", {
                  stage: status.stage,
                  status: status.status,
                  stagesComplete: status.stagesComplete ?? [],
                })
              );
            } catch {
              done = true;
              break;
            }

            // Check if pipeline is complete: stage 5 signals full completion
            const isComplete =
              status.stage >= 5 || status.status === "complete";

            if (isComplete) {
              try {
                controller.enqueue(
                  encodeSSE("pipeline_complete", {
                    campaignId: status.campaignId ?? status.campaign?.id ?? null,
                    assetsCount: status.assetCount ?? 0,
                  })
                );
                controller.close();
              } catch {
                // controller may already be closed
              }
              done = true;
              break;
            }
          }

          // Wait for next poll interval
          await new Promise<void>((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
        }
      }

      // Handle client disconnect
      req.signal.addEventListener("abort", () => {
        done = true;
        try { controller.close(); } catch { /* already closed */ }
      });

      poll().catch(() => {
        done = true;
        try { controller.close(); } catch { /* already closed */ }
      });
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
