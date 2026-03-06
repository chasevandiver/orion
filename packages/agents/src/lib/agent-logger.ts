/**
 * Structured agent output logger.
 *
 * Emits a JSON log line for every agent invocation so that operators can
 * trace the full Strategist → ContentCreator → Optimizer → Distribution
 * pipeline by runId, and correlate token spend to a specific promptVersion.
 *
 * In production, pipe stdout to your log aggregator (Datadog, Loki, etc.).
 * In Inngest jobs, the log lines appear in the Inngest dashboard run view.
 */

export interface AgentLogEntry {
  /** ISO 8601 timestamp */
  timestamp: string;
  /** Unique run identifier — pass the Inngest event ID or generate a UUID */
  runId: string;
  /** Agent class name, e.g. "MarketingStrategistAgent" */
  agentName: string;
  /** Semver prompt version declared by the agent */
  promptVersion: string;
  /** Which organisation triggered this agent run */
  orgId: string;
  /** Optional resource being processed (goalId, campaignId, contactId…) */
  resourceId?: string;
  /** Total tokens consumed (input + output) */
  tokensUsed: number;
  /** Wall-clock duration in milliseconds */
  durationMs: number;
  /** Whether the agent run succeeded */
  success: boolean;
  /** Short error message if success === false */
  errorMessage?: string;
  /** Any extra key/value pairs the caller wants to attach */
  meta?: Record<string, unknown>;
}

/**
 * Write a single structured log entry.
 * Uses console.log so it lands in stdout regardless of environment.
 */
export function logAgentRun(entry: AgentLogEntry): void {
  console.log(JSON.stringify({ level: "info", service: "orion-agent", ...entry }));
}

/**
 * Convenience timer: call start(), run your agent, then call done().
 *
 * @example
 * const timer = agentTimer("MarketingStrategistAgent", "1.0.0", { orgId, runId });
 * const result = await agent.generate(input);
 * timer.done({ tokensUsed: result.tokensUsed });
 */
export function agentTimer(
  agentName: string,
  promptVersion: string,
  context: { runId: string; orgId: string; resourceId?: string; meta?: Record<string, unknown> },
) {
  const startMs = Date.now();

  return {
    done(opts: { tokensUsed: number; errorMessage?: string }) {
      logAgentRun({
        timestamp: new Date().toISOString(),
        runId: context.runId,
        agentName,
        promptVersion,
        orgId: context.orgId,
        resourceId: context.resourceId,
        tokensUsed: opts.tokensUsed,
        durationMs: Date.now() - startMs,
        success: !opts.errorMessage,
        errorMessage: opts.errorMessage,
        meta: context.meta,
      });
    },
  };
}
