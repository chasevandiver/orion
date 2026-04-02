/**
 * TwilioClient — SMS publishing via Twilio REST API.
 *
 * Sends SMS marketing messages to a single phone number or broadcast list.
 * Credentials are stored AES-256 encrypted per org in channelConnections:
 *   - accessTokenEnc  → Twilio Auth Token
 *   - accessToken     → (runtime) decrypted Auth Token
 *   - accountId       → Twilio Account SID
 *   - accountName     → Twilio phone number (From)
 *
 * Usage:
 *   const client = new TwilioClient(orgId, { accessToken: authToken }, accountSid, fromPhone);
 *   await client.publish({ content: "Your message. Reply STOP to unsubscribe.", to: "+15551234567" });
 */

import { BasePlatformClient } from "../base/client.js";
import type { OAuthTokens, PublishResult, ChannelMetrics } from "../base/client.js";

const TWILIO_API = "https://api.twilio.com/2010-04-01";

/** SMS-specific publish payload — extends base with required `to` number. */
export interface SmsPublishPayload {
  /** The message body. Max 160 chars for single SMS, 320 for 2-segment. */
  content: string;
  /** Recipient phone number in E.164 format, e.g. "+15551234567". */
  to: string;
  /** Optional list of media URLs (for MMS). */
  mediaUrls?: string[];
}

export interface TwilioMessageStatus {
  sid: string;
  status: "queued" | "sending" | "sent" | "delivered" | "undelivered" | "failed" | string;
  to: string;
  from: string;
  body: string;
  numSegments: string;
  errorCode: string | null;
  errorMessage: string | null;
  dateCreated: string;
  dateSent: string | null;
}

interface TwilioSendResponse {
  sid: string;
  status: string;
  to: string;
  from: string;
  body: string;
  num_segments: string;
  error_code: string | null;
  error_message: string | null;
  date_created: string;
  date_sent: string | null;
}

export class TwilioClient extends BasePlatformClient {
  private accountSid: string;
  private fromPhone: string;

  /**
   * @param orgId      Orion org ID
   * @param tokens     OAuthTokens where accessToken = Twilio Auth Token
   * @param accountSid Twilio Account SID (e.g. "ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx")
   * @param fromPhone  Twilio phone number to send from, in E.164 format
   */
  constructor(
    orgId: string,
    tokens: OAuthTokens,
    accountSid: string,
    fromPhone: string,
  ) {
    super(orgId, tokens);
    this.accountSid = accountSid;
    this.fromPhone = fromPhone;
  }

  get channelName(): string {
    return "sms";
  }

  /**
   * Send an SMS (or MMS if mediaUrls are provided).
   * `payload.to` must be a valid E.164 phone number.
   */
  async publish(payload: SmsPublishPayload): Promise<PublishResult> {
    const body = new URLSearchParams({
      To:   payload.to,
      From: this.fromPhone,
      Body: payload.content,
    });

    if (payload.mediaUrls?.length) {
      payload.mediaUrls.forEach((url) => body.append("MediaUrl", url));
    }

    const response = await fetch(
      `${TWILIO_API}/Accounts/${this.accountSid}/Messages.json`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${Buffer.from(`${this.accountSid}:${this.tokens.accessToken}`).toString("base64")}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: body.toString(),
      },
    );

    if (!response.ok) {
      const errBody = await response.text();
      throw new Error(`Twilio API error ${response.status}: ${errBody}`);
    }

    const result = (await response.json()) as TwilioSendResponse;

    if (result.error_code) {
      throw new Error(
        `Twilio send error ${result.error_code}: ${result.error_message ?? "Unknown error"}`,
      );
    }

    return {
      platformPostId: result.sid,
      url: `https://console.twilio.com/us1/monitor/logs/sms/${result.sid}`,
      publishedAt: new Date(result.date_created),
    };
  }

  /**
   * Fetch delivery status for a previously sent message by SID.
   */
  async getPostMetrics(platformPostId: string): Promise<ChannelMetrics> {
    const response = await fetch(
      `${TWILIO_API}/Accounts/${this.accountSid}/Messages/${platformPostId}.json`,
      {
        headers: {
          Authorization: `Basic ${Buffer.from(`${this.accountSid}:${this.tokens.accessToken}`).toString("base64")}`,
        },
      },
    );

    if (!response.ok) {
      const errBody = await response.text();
      throw new Error(`Twilio metrics error ${response.status}: ${errBody}`);
    }

    const msg = (await response.json()) as TwilioSendResponse;

    // Map Twilio delivery status to a numeric engagement signal
    const delivered = msg.status === "delivered" ? 1 : 0;

    return {
      impressions: 1,       // 1 message sent
      clicks: 0,            // Twilio doesn't track link clicks natively
      engagements: delivered,
      fetchedAt: new Date(),
    };
  }

  /**
   * Validate credentials by fetching the account resource.
   */
  async validateTokens(): Promise<boolean> {
    try {
      const response = await fetch(
        `${TWILIO_API}/Accounts/${this.accountSid}.json`,
        {
          headers: {
            Authorization: `Basic ${Buffer.from(`${this.accountSid}:${this.tokens.accessToken}`).toString("base64")}`,
          },
        },
      );
      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * Twilio uses static API keys — no OAuth refresh needed.
   */
  async refreshTokens(): Promise<OAuthTokens> {
    return this.tokens;
  }
}
