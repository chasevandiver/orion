export { BaseAgent, anthropic, DEFAULT_MODEL } from "./agents/base.js";
export { MarketingStrategistAgent } from "./agents/strategist.js";
export { ContentCreatorAgent } from "./agents/content-creator.js";
export { OptimizationAgent } from "./agents/optimizer.js";
export { DistributionAgent } from "./agents/distribution.js";
export { CRMIntelligenceAgent } from "./agents/crm-intelligence.js";
export { AnalyticsAgent } from "./agents/analytics-intelligence.js";

export type { StrategyInput, StrategyOutput } from "./agents/strategist.js";
export type { ContentInput } from "./agents/content-creator.js";
export type { OptimizationInput } from "./agents/optimizer.js";
export type { DistributionInput, DistributionResult } from "./agents/distribution.js";
export type {
  ContactContext,
  LeadScoreResult,
  EnrichmentResult,
  InsightResult,
} from "./agents/crm-intelligence.js";
export type { AnalyticsQueryInput, AnalyticsReport } from "./agents/analytics-intelligence.js";
