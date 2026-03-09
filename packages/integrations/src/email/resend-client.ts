/**
 * ResendClient — Email publishing via Resend API.
 *
 * Sends marketing emails to contacts/lists using the Resend API.
 * Formats contentText as HTML with basic paragraph wrapping.
 * API key is stored AES-256 encrypted per org in platform_credentials.
 *
 * Requirements:
 *   - RESEND_FROM_EMAIL env var (e.g. "marketing@yourdomain.com")
 *   - Org must have a channelConnection for channel="email" with
 *     accessTokenEnc containing the Resend API key
 */

export interface ResendPublishPayload {
  subject: string;
  contentText: string;
  toEmail?: string;
  listId?: string;
  fromName?: string;
}

export interface ResendPublishResult {
  platformPostId: string;
  url: string;
  publishedAt: Date;
}

interface ResendSendResponse {
  id: string;
}

interface ResendBroadcastResponse {
  id: string;
}

const RESEND_API = "https://api.resend.com";

export class ResendClient {
  private apiKey: string;
  private orgId: string;
  private fromEmail: string;

  constructor(orgId: string, apiKey: string) {
    this.orgId = orgId;
    this.apiKey = apiKey;
    this.fromEmail = process.env.RESEND_FROM_EMAIL ?? "noreply@orion.app";
  }

  get channelName() {
    return "email";
  }

  /**
   * Convert plain text content to minimal HTML email.
   * Preserves double-newline paragraphs and single-newline line breaks.
   */
  private formatAsHtml(text: string, fromName?: string): string {
    const paragraphs = text.split(/\n\n+/).map((p) =>
      `<p>${p.replace(/\n/g, "<br/>").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</p>`,
    );

    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #1a1a1a; max-width: 600px; margin: 0 auto; padding: 24px 16px; }
    p { line-height: 1.6; margin: 0 0 16px; }
    .footer { margin-top: 40px; padding-top: 16px; border-top: 1px solid #e5e5e5; font-size: 12px; color: #666; }
  </style>
</head>
<body>
  ${paragraphs.join("\n  ")}
  <div class="footer">
    <p>You are receiving this email from ${fromName ?? "ORION Marketing"}.<br/>
    To unsubscribe, reply with "unsubscribe".</p>
  </div>
</body>
</html>`;
  }

  /**
   * Send to a single email address (transactional/direct send).
   */
  async sendToAddress(payload: ResendPublishPayload): Promise<ResendPublishResult> {
    if (!payload.toEmail) throw new Error("toEmail is required for single-address sends");

    const html = this.formatAsHtml(payload.contentText, payload.fromName);

    const response = await fetch(`${RESEND_API}/emails`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: payload.fromName
          ? `${payload.fromName} <${this.fromEmail}>`
          : this.fromEmail,
        to: [payload.toEmail],
        subject: payload.subject,
        html,
        text: payload.contentText,
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Resend API error ${response.status}: ${body}`);
    }

    const result = await response.json() as ResendSendResponse;
    const publishedAt = new Date();

    return {
      platformPostId: result.id,
      url: `https://resend.com/emails/${result.id}`,
      publishedAt,
    };
  }

  /**
   * Send to a Resend Audience list (broadcast).
   * listId is the Resend Audience ID stored per org.
   */
  async sendToList(payload: ResendPublishPayload): Promise<ResendPublishResult> {
    if (!payload.listId) throw new Error("listId is required for list broadcasts");

    const html = this.formatAsHtml(payload.contentText, payload.fromName);

    // Create broadcast
    const createResponse = await fetch(`${RESEND_API}/broadcasts`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        audience_id: payload.listId,
        from: payload.fromName
          ? `${payload.fromName} <${this.fromEmail}>`
          : this.fromEmail,
        subject: payload.subject,
        html,
        text: payload.contentText,
        name: `Broadcast ${new Date().toISOString()}`,
      }),
    });

    if (!createResponse.ok) {
      const body = await createResponse.text();
      throw new Error(`Resend broadcast create error ${createResponse.status}: ${body}`);
    }

    const broadcast = await createResponse.json() as ResendBroadcastResponse;

    // Send the broadcast
    const sendResponse = await fetch(`${RESEND_API}/broadcasts/${broadcast.id}/send`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
    });

    if (!sendResponse.ok) {
      const body = await sendResponse.text();
      throw new Error(`Resend broadcast send error ${sendResponse.status}: ${body}`);
    }

    const publishedAt = new Date();

    return {
      platformPostId: broadcast.id,
      url: `https://resend.com/broadcasts/${broadcast.id}`,
      publishedAt,
    };
  }

  /**
   * Unified publish method — routes to list or single address based on payload.
   */
  async publish(payload: ResendPublishPayload): Promise<ResendPublishResult> {
    if (payload.listId) {
      return this.sendToList(payload);
    }
    return this.sendToAddress(payload);
  }
}
