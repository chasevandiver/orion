// Re-export the canonical Inngest client so apps/api can import it
// from @orion/queue instead of instantiating its own conflicting instance.
export { inngest } from "./client.js";

export { allFunctions } from "./jobs/index.js";
export {
  generateStrategy,
  publishScheduledPost,
  rollupAnalytics,
  runPostPublishOptimization,
  runOptimizationAgent,
  scorePendingContacts,
  updateLeadStatuses,
  executeWorkflow,
  checkScheduledWorkflows,
  dispatchEventWorkflows,
  templateWelcomeNewLead,
  templateHotLeadAlert,
  templateWeeklyPerformanceDigest,
  templateStaleCampaignReactivation,
  templateContentApprovalPipeline,
  checkAndFireHotLeadEvent,
  generateRecommendations,
  recycleEvergreenContent,
  recycleSingleAsset,
  refreshCompetitorIntel,
} from "./jobs/index.js";

export { runAgentPipeline } from "./jobs/orchestrate-pipeline.js";

export { WORKFLOW_TEMPLATES, TEMPLATE_MAP } from "./workflows/templates.js";
export type { WorkflowTemplate } from "./workflows/templates.js";
