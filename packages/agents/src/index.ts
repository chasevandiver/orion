export { BaseAgent, anthropic, DEFAULT_MODEL } from "./agents/base.js";
export { MarketingStrategistAgent } from "./agents/strategist.js";
export { ContentCreatorAgent } from "./agents/content-creator.js";
export { ImageGeneratorAgent } from "./agents/image-generator.js";
export { OptimizationAgent } from "./agents/optimizer.js";
export { DistributionAgent } from "./agents/distribution.js";
export { CRMIntelligenceAgent } from "./agents/crm-intelligence.js";
export { AnalyticsAgent } from "./agents/analytics-intelligence.js";
export { CompetitorIntelligenceAgent } from "./agents/competitor-intelligence.js";
export { SEOAgent } from "./agents/seo.js";
export { LandingPageAgent } from "./agents/landing-page.js";
export { PaidAdsAgent } from "./agents/paid-ads.js";
export { LeadMagnetAgent } from "./agents/lead-magnet.js";
export { BrandVoiceAgent } from "./agents/brand-voice.js";

export type { StrategyInput, StrategyOutput, BrandProfile, BrandBrief } from "./agents/strategist.js";
export type { ContentInput } from "./agents/content-creator.js";
export type { ImageInput, ImageOutput } from "./agents/image-generator.js";
export type { OptimizationInput } from "./agents/optimizer.js";
export type { DistributionInput, DistributionResult } from "./agents/distribution.js";
export type {
  ContactContext,
  LeadScoreResult,
  EnrichmentResult,
  InsightResult,
} from "./agents/crm-intelligence.js";
export type { AnalyticsQueryInput, AnalyticsReport } from "./agents/analytics-intelligence.js";
export type { CompetitorInput, CompetitorIntelligenceOutput } from "./agents/competitor-intelligence.js";
export type { SEOInput, SEOOutput } from "./agents/seo.js";
export type { LandingPageInput, LandingPageOutput } from "./agents/landing-page.js";
export type { PaidAdsInput, PaidAdsOutput } from "./agents/paid-ads.js";
export type { LeadMagnetType, LeadMagnetInput, LeadMagnetOutput } from "./agents/lead-magnet.js";
export type { BrandVoiceEdit, BrandVoiceInput, BrandVoiceProfile } from "./agents/brand-voice.js";

// Phase 4: structured logging + Redis conversation state
export { logAgentRun, agentTimer } from "./lib/agent-logger.js";
export type { AgentLogEntry } from "./lib/agent-logger.js";
export {
  loadConversation,
  appendMessage,
  clearConversation,
  getMessageHistory,
} from "./lib/redis-state.js";
export type { AgentConversationState, ConversationMessage } from "./lib/redis-state.js";
