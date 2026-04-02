/**
 * Pre-built workflow template definitions.
 *
 * Each template describes a ready-made automation that orgs can activate
 * with a single click. When activated, a `workflows` DB record is created
 * with stepsJson[0].templateId set to the template's id, and dedicated
 * Inngest functions handle execution.
 */

export interface WorkflowTemplate {
  id: string;
  name: string;
  description: string;
  triggerType: "event" | "schedule";
  triggerDescription: string;
  /** Stored in triggerConfigJson when workflow record is created. */
  triggerConfigJson: Record<string, unknown>;
  /** Stored in stepsJson when workflow record is created. */
  stepsJson: Array<{ type: string; templateId: string; [k: string]: unknown }>;
  /** Emoji icon for the card UI. */
  icon: string;
  /** Step summary shown in the UI. */
  steps: string[];
}

export const WORKFLOW_TEMPLATES: WorkflowTemplate[] = [
  {
    id: "welcome-new-lead",
    name: "Welcome New Lead",
    description:
      "Automatically onboard every new contact with a timed email drip: a welcome message immediately, then a product overview 2 days later, followed by an AI lead score.",
    triggerType: "event",
    triggerDescription: "New contact created",
    icon: "👋",
    triggerConfigJson: { event: "contact.created", templateId: "welcome-new-lead" },
    stepsJson: [{ type: "template", templateId: "welcome-new-lead" }],
    steps: [
      "Send welcome email",
      "Wait 2 days",
      "Send product overview email",
      "Score lead with AI",
    ],
  },
  {
    id: "hot-lead-alert",
    name: "Hot Lead Alert",
    description:
      "Get notified instantly when a contact's AI lead score crosses 80. An in-app alert is created for the org owner and a note is logged on the contact record.",
    triggerType: "event",
    triggerDescription: "Contact lead score crosses 80",
    icon: "🔥",
    triggerConfigJson: { event: "lead.hot", templateId: "hot-lead-alert" },
    stepsJson: [{ type: "template", templateId: "hot-lead-alert" }],
    steps: [
      "Notify org owner",
      "Log note on contact record",
    ],
  },
  {
    id: "weekly-performance-digest",
    name: "Weekly Performance Digest",
    description:
      "Every Monday at 9 AM UTC, run the AI Analytics Agent over the past 7 days of campaign data and deliver a performance summary to the org owner via email.",
    triggerType: "schedule",
    triggerDescription: "Every Monday at 9 AM UTC",
    icon: "📊",
    triggerConfigJson: { cron: "0 9 * * 1", templateId: "weekly-performance-digest" },
    stepsJson: [{ type: "template", templateId: "weekly-performance-digest" }],
    steps: [
      "Run Analytics Agent (last 7 days)",
      "Send performance summary email",
    ],
  },
  {
    id: "stale-campaign-reactivation",
    name: "Stale Campaign Reactivation",
    description:
      "Runs daily at 8 AM UTC. Finds any active campaign that hasn't had new content in 30+ days and sends a notification suggesting a fresh topic to reactivate it.",
    triggerType: "schedule",
    triggerDescription: "Daily at 8 AM UTC",
    icon: "♻️",
    triggerConfigJson: { cron: "0 8 * * *", templateId: "stale-campaign-reactivation" },
    stepsJson: [{ type: "template", templateId: "stale-campaign-reactivation" }],
    steps: [
      "Detect campaigns inactive for 30+ days",
      "Send reactivation notification with topic suggestion",
    ],
  },
  {
    id: "content-approval-pipeline",
    name: "Content Approval Pipeline",
    description:
      "When a new content asset is created, notify all org admins for review. Once approved, the asset is automatically scheduled for publishing.",
    triggerType: "event",
    triggerDescription: "New content asset created",
    icon: "✅",
    triggerConfigJson: { event: "asset.created", templateId: "content-approval-pipeline" },
    stepsJson: [{ type: "template", templateId: "content-approval-pipeline" }],
    steps: [
      "Notify admins for review",
      "Wait for approval decision",
      "Auto-schedule if approved",
    ],
  },
];

export const TEMPLATE_MAP: Record<string, WorkflowTemplate> = Object.fromEntries(
  WORKFLOW_TEMPLATES.map((t) => [t.id, t]),
);
