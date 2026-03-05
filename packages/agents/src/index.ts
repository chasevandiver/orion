export { BaseAgent, anthropic, DEFAULT_MODEL } from "./agents/base.js";
export { MarketingStrategistAgent } from "./agents/strategist.js";
export { ContentCreatorAgent } from "./agents/content-creator.js";
export { OptimizationAgent } from "./agents/optimizer.js";

export type { StrategyInput, StrategyOutput } from "./agents/strategist.js";
export type { ContentInput } from "./agents/content-creator.js";
export type { OptimizationInput } from "./agents/optimizer.js";
