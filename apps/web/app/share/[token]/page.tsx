import { db } from "@orion/db";
import { landingPages, leadMagnets } from "@orion/db/schema";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { CaptureForm } from "./capture-form";

// ── Types ───────────────────────────────────────────────────────────────────

interface LandingPageContent {
  hero?: {
    headline?: string;
    subheadline?: string;
    ctaText?: string;
    ctaUrl?: string;
  };
  benefits?: Array<{ title?: string; description?: string }>;
  socialProof?: Array<{ quote?: string; author?: string; company?: string }>;
  faq?: Array<{ question?: string; answer?: string }>;
  cta?: {
    headline?: string;
    subtext?: string;
    buttonText?: string;
    buttonUrl?: string;
    // Form fields injected by the pipeline (from LandingPageAgent output)
    formFields?: string[];
  };
  // Attribution fields injected by the pipeline
  _trackingId?: string;
  _captureEndpoint?: string;
}

interface LeadMagnetContent {
  title?: string;
  magnetType?: string;
  sections?: Array<{ heading?: string; content?: string }>;
  keyTakeaways?: string[];
  nextSteps?: string[];
}

// ── Helpers ─────────────────────────────────────────────────────────────────

const BRAND_GREEN = "#00ff88";

function Badge({ label, color }: { label: string; color: string }) {
  return (
    <span
      style={{
        display: "inline-block",
        padding: "0.25rem 0.75rem",
        borderRadius: "9999px",
        fontSize: "0.75rem",
        fontWeight: 600,
        letterSpacing: "0.05em",
        textTransform: "uppercase",
        backgroundColor: `${color}22`,
        color,
        border: `1px solid ${color}44`,
      }}
    >
      {label}
    </span>
  );
}

const MAGNET_TYPE_LABELS: Record<string, string> = {
  ebook: "eBook",
  checklist: "Checklist",
  template: "Template",
  webinar: "Webinar",
  quiz: "Quiz",
};

// ── Landing Page Renderer ────────────────────────────────────────────────────

function LandingPageView({
  page,
  content,
  orgId,
  campaignId,
}: {
  page: { title: string; metaTitle?: string | null; publishedAt?: Date | null };
  content: LandingPageContent;
  orgId: string;
  campaignId: string | null;
}) {
  const { hero, benefits, socialProof, faq, cta } = content;

  return (
    <div style={{ fontFamily: "system-ui, -apple-system, sans-serif", color: "#1a1a2e", minHeight: "100vh" }}>
      {/* Hero */}
      <section
        style={{
          background: `linear-gradient(135deg, ${BRAND_GREEN}15 0%, #8b5cf622 100%)`,
          padding: "5rem 1.5rem 4rem",
          textAlign: "center",
        }}
      >
        <div style={{ maxWidth: "720px", margin: "0 auto" }}>
          {hero?.headline && (
            <h1
              style={{
                fontSize: "clamp(2rem, 5vw, 3.5rem)",
                fontWeight: 800,
                lineHeight: 1.1,
                marginBottom: "1.25rem",
                color: "#0f0f23",
              }}
            >
              {hero.headline}
            </h1>
          )}
          {hero?.subheadline && (
            <p
              style={{
                fontSize: "1.2rem",
                color: "#4b5563",
                lineHeight: 1.6,
                marginBottom: "2rem",
              }}
            >
              {hero.subheadline}
            </p>
          )}
          {hero?.ctaText && (
            <a
              href={hero.ctaUrl || "#"}
              style={{
                display: "inline-block",
                backgroundColor: BRAND_GREEN,
                color: "#fff",
                padding: "0.875rem 2.5rem",
                borderRadius: "0.5rem",
                fontWeight: 700,
                fontSize: "1.05rem",
                textDecoration: "none",
                boxShadow: `0 4px 20px ${BRAND_GREEN}55`,
                transition: "opacity 0.2s",
              }}
            >
              {hero.ctaText}
            </a>
          )}
        </div>
      </section>

      {/* Benefits */}
      {benefits && benefits.length > 0 && (
        <section style={{ padding: "4rem 1.5rem", maxWidth: "900px", margin: "0 auto" }}>
          <h2
            style={{
              textAlign: "center",
              fontSize: "1.75rem",
              fontWeight: 700,
              marginBottom: "2.5rem",
              color: "#0f0f23",
            }}
          >
            Why It Works
          </h2>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))",
              gap: "1.5rem",
            }}
          >
            {benefits.map((benefit, i) => (
              <div
                key={i}
                style={{
                  background: "#fff",
                  border: "1px solid #e5e7eb",
                  borderRadius: "0.75rem",
                  padding: "1.5rem",
                  boxShadow: "0 1px 6px rgba(0,0,0,0.06)",
                }}
              >
                <div
                  style={{
                    width: "2.5rem",
                    height: "2.5rem",
                    borderRadius: "50%",
                    backgroundColor: `${BRAND_GREEN}18`,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    marginBottom: "1rem",
                    fontSize: "1.1rem",
                    fontWeight: 700,
                    color: BRAND_GREEN,
                  }}
                >
                  {i + 1}
                </div>
                {benefit.title && (
                  <h3 style={{ fontWeight: 700, marginBottom: "0.5rem", color: "#111827" }}>
                    {benefit.title}
                  </h3>
                )}
                {benefit.description && (
                  <p style={{ color: "#6b7280", lineHeight: 1.6, fontSize: "0.95rem" }}>
                    {benefit.description}
                  </p>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Social Proof / Testimonials */}
      {socialProof && socialProof.length > 0 && (
        <section
          style={{
            backgroundColor: "#f9fafb",
            padding: "4rem 1.5rem",
            borderTop: "1px solid #e5e7eb",
            borderBottom: "1px solid #e5e7eb",
          }}
        >
          <div style={{ maxWidth: "900px", margin: "0 auto" }}>
            <h2
              style={{
                textAlign: "center",
                fontSize: "1.75rem",
                fontWeight: 700,
                marginBottom: "2.5rem",
                color: "#0f0f23",
              }}
            >
              What People Are Saying
            </h2>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
                gap: "1.25rem",
              }}
            >
              {socialProof.map((item, i) => (
                <div
                  key={i}
                  style={{
                    background: "#fff",
                    border: "1px solid #e5e7eb",
                    borderRadius: "0.75rem",
                    padding: "1.5rem",
                    boxShadow: "0 1px 4px rgba(0,0,0,0.05)",
                  }}
                >
                  <p
                    style={{
                      fontSize: "0.95rem",
                      color: "#374151",
                      lineHeight: 1.65,
                      fontStyle: "italic",
                      marginBottom: "1rem",
                    }}
                  >
                    &ldquo;{item.quote}&rdquo;
                  </p>
                  <div style={{ fontSize: "0.85rem" }}>
                    <span style={{ fontWeight: 600, color: "#111827" }}>{item.author}</span>
                    {item.company && (
                      <span style={{ color: "#9ca3af" }}> · {item.company}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* FAQ */}
      {faq && faq.length > 0 && (
        <section style={{ padding: "4rem 1.5rem", maxWidth: "700px", margin: "0 auto" }}>
          <h2
            style={{
              textAlign: "center",
              fontSize: "1.75rem",
              fontWeight: 700,
              marginBottom: "2.5rem",
              color: "#0f0f23",
            }}
          >
            Frequently Asked Questions
          </h2>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            {faq.map((item, i) => (
              <details
                key={i}
                style={{
                  background: "#fff",
                  border: "1px solid #e5e7eb",
                  borderRadius: "0.625rem",
                  overflow: "hidden",
                }}
              >
                <summary
                  style={{
                    padding: "1rem 1.25rem",
                    fontWeight: 600,
                    cursor: "pointer",
                    color: "#111827",
                    listStyle: "none",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    userSelect: "none",
                  }}
                >
                  {item.question}
                  <span style={{ fontSize: "1.25rem", color: BRAND_GREEN, flexShrink: 0, marginLeft: "1rem" }}>
                    &#43;
                  </span>
                </summary>
                <div
                  style={{
                    padding: "0 1.25rem 1rem",
                    color: "#4b5563",
                    lineHeight: 1.65,
                    fontSize: "0.95rem",
                    borderTop: "1px solid #f3f4f6",
                  }}
                >
                  {item.answer}
                </div>
              </details>
            ))}
          </div>
        </section>
      )}

      {/* Final CTA — renders a contact-capture form when formFields are present */}
      {cta && (
        <section
          id="cta-form"
          style={{
            background: `linear-gradient(135deg, ${BRAND_GREEN} 0%, #8b5cf6 100%)`,
            padding: "4rem 1.5rem",
            textAlign: "center",
            color: "#fff",
          }}
        >
          <div style={{ maxWidth: "600px", margin: "0 auto" }}>
            {cta.headline && (
              <h2 style={{ fontSize: "2rem", fontWeight: 800, marginBottom: "1rem" }}>
                {cta.headline}
              </h2>
            )}
            {cta.subtext && (
              <p style={{ fontSize: "1.05rem", opacity: 0.9, marginBottom: "2rem", lineHeight: 1.6 }}>
                {cta.subtext}
              </p>
            )}
            {cta.formFields && cta.formFields.length > 0 ? (
              <CaptureForm
                formFields={cta.formFields}
                orgId={orgId}
                campaignId={campaignId}
                sourceChannel="landing_page"
                trackingId={content._trackingId ?? null}
                captureEndpoint={content._captureEndpoint ?? `${process.env.INTERNAL_API_URL ?? "http://localhost:3001"}/contacts/capture`}
                buttonText={cta.buttonText || "Get Started"}
                accentColor={BRAND_GREEN}
              />
            ) : cta.buttonText ? (
              <a
                href={cta.buttonUrl || "#"}
                style={{
                  display: "inline-block",
                  backgroundColor: "#fff",
                  color: BRAND_GREEN,
                  padding: "0.875rem 2.5rem",
                  borderRadius: "0.5rem",
                  fontWeight: 700,
                  fontSize: "1.05rem",
                  textDecoration: "none",
                  boxShadow: "0 4px 20px rgba(0,0,0,0.15)",
                }}
              >
                {cta.buttonText}
              </a>
            ) : null}
          </div>
        </section>
      )}
    </div>
  );
}

// ── Lead Magnet Renderer ─────────────────────────────────────────────────────

function LeadMagnetView({
  magnet,
  content,
}: {
  magnet: { title: string; magnetType: string };
  content: LeadMagnetContent;
}) {
  const typeLabel = MAGNET_TYPE_LABELS[magnet.magnetType] ?? magnet.magnetType;

  return (
    <div style={{ fontFamily: "system-ui, -apple-system, sans-serif", color: "#1a1a2e", minHeight: "100vh" }}>
      {/* Header */}
      <section
        style={{
          background: `linear-gradient(135deg, ${BRAND_GREEN}15 0%, #8b5cf622 100%)`,
          padding: "4rem 1.5rem 3rem",
          textAlign: "center",
        }}
      >
        <div style={{ maxWidth: "680px", margin: "0 auto" }}>
          <div style={{ marginBottom: "1rem" }}>
            <Badge label={typeLabel} color={BRAND_GREEN} />
          </div>
          <h1
            style={{
              fontSize: "clamp(1.75rem, 4vw, 3rem)",
              fontWeight: 800,
              lineHeight: 1.15,
              marginBottom: "1.5rem",
              color: "#0f0f23",
            }}
          >
            {content.title ?? magnet.title}
          </h1>
          <a
            href="#"
            style={{
              display: "inline-block",
              backgroundColor: BRAND_GREEN,
              color: "#fff",
              padding: "0.875rem 2.5rem",
              borderRadius: "0.5rem",
              fontWeight: 700,
              fontSize: "1.05rem",
              textDecoration: "none",
              boxShadow: `0 4px 20px ${BRAND_GREEN}55`,
            }}
          >
            Download Free
          </a>
        </div>
      </section>

      <div style={{ maxWidth: "800px", margin: "0 auto", padding: "3rem 1.5rem" }}>
        {/* Key Takeaways */}
        {content.keyTakeaways && content.keyTakeaways.length > 0 && (
          <div
            style={{
              background: "#fff",
              border: "1px solid #e5e7eb",
              borderRadius: "0.75rem",
              padding: "1.75rem",
              marginBottom: "2.5rem",
              boxShadow: "0 1px 6px rgba(0,0,0,0.06)",
            }}
          >
            <h2 style={{ fontSize: "1.25rem", fontWeight: 700, marginBottom: "1.25rem", color: "#111827" }}>
              Key Takeaways
            </h2>
            <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              {content.keyTakeaways.map((item, i) => (
                <li
                  key={i}
                  style={{ display: "flex", alignItems: "flex-start", gap: "0.75rem", fontSize: "0.95rem", color: "#374151" }}
                >
                  <span
                    style={{
                      flexShrink: 0,
                      width: "1.25rem",
                      height: "1.25rem",
                      borderRadius: "50%",
                      backgroundColor: `${BRAND_GREEN}20`,
                      color: BRAND_GREEN,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: "0.7rem",
                      fontWeight: 700,
                      marginTop: "0.1rem",
                    }}
                  >
                    &#10003;
                  </span>
                  {item}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Table of Contents / Sections */}
        {content.sections && content.sections.length > 0 && (
          <div style={{ marginBottom: "2.5rem" }}>
            <h2 style={{ fontSize: "1.25rem", fontWeight: 700, marginBottom: "1.25rem", color: "#111827" }}>
              Table of Contents
            </h2>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
              {content.sections.map((section, i) => (
                <div
                  key={i}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "1rem",
                    padding: "0.75rem 1rem",
                    background: "#f9fafb",
                    border: "1px solid #e5e7eb",
                    borderRadius: "0.5rem",
                    fontSize: "0.95rem",
                  }}
                >
                  <span
                    style={{
                      flexShrink: 0,
                      fontSize: "0.8rem",
                      fontWeight: 700,
                      color: BRAND_GREEN,
                      minWidth: "1.5rem",
                    }}
                  >
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span style={{ fontWeight: 500, color: "#374151" }}>{section.heading}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Next Steps */}
        {content.nextSteps && content.nextSteps.length > 0 && (
          <div
            style={{
              background: `${BRAND_GREEN}10`,
              border: `1px solid ${BRAND_GREEN}30`,
              borderRadius: "0.75rem",
              padding: "1.75rem",
              marginBottom: "2.5rem",
            }}
          >
            <h2 style={{ fontSize: "1.25rem", fontWeight: 700, marginBottom: "1.25rem", color: "#111827" }}>
              Next Steps
            </h2>
            <ol style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              {content.nextSteps.map((step, i) => (
                <li
                  key={i}
                  style={{ display: "flex", alignItems: "flex-start", gap: "0.75rem", fontSize: "0.95rem", color: "#374151" }}
                >
                  <span
                    style={{
                      flexShrink: 0,
                      width: "1.5rem",
                      height: "1.5rem",
                      borderRadius: "50%",
                      backgroundColor: BRAND_GREEN,
                      color: "#fff",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: "0.75rem",
                      fontWeight: 700,
                      marginTop: "0.05rem",
                    }}
                  >
                    {i + 1}
                  </span>
                  {step}
                </li>
              ))}
            </ol>
          </div>
        )}

        {/* Download CTA */}
        <div
          style={{
            background: `linear-gradient(135deg, ${BRAND_GREEN} 0%, #8b5cf6 100%)`,
            borderRadius: "0.75rem",
            padding: "2.5rem",
            textAlign: "center",
            color: "#fff",
          }}
        >
          <h3 style={{ fontSize: "1.5rem", fontWeight: 800, marginBottom: "0.75rem" }}>
            Ready to get started?
          </h3>
          <p style={{ opacity: 0.9, marginBottom: "1.5rem", fontSize: "0.95rem" }}>
            Download your free {typeLabel.toLowerCase()} now.
          </p>
          <a
            href="#"
            style={{
              display: "inline-block",
              backgroundColor: "#fff",
              color: BRAND_GREEN,
              padding: "0.875rem 2.5rem",
              borderRadius: "0.5rem",
              fontWeight: 700,
              fontSize: "1rem",
              textDecoration: "none",
            }}
          >
            Download Now — It&apos;s Free
          </a>
        </div>
      </div>
    </div>
  );
}

// ── Page ────────────────────────────────────────────────────────────────────

export default async function SharePage({ params }: { params: { token: string } }) {
  const { token } = params;

  // Try landing page first
  const landingPage = await db.query.landingPages.findFirst({
    where: eq(landingPages.shareToken, token),
  });

  if (landingPage) {
    const content = (landingPage.contentJson ?? {}) as LandingPageContent;

    return (
      <>
        <LandingPageView
          page={landingPage}
          content={content}
          orgId={landingPage.orgId}
          campaignId={landingPage.campaignId ?? null}
        />
        <footer
          style={{
            textAlign: "center",
            padding: "1.25rem",
            borderTop: "1px solid #e5e7eb",
            fontSize: "0.8rem",
            color: "#9ca3af",
            backgroundColor: "#f9fafb",
          }}
        >
          Powered by{" "}
          <span style={{ fontWeight: 700, color: BRAND_GREEN }}>ORION</span>
        </footer>
      </>
    );
  }

  // Try lead magnet
  const leadMagnet = await db.query.leadMagnets.findFirst({
    where: eq(leadMagnets.shareToken, token),
  });

  if (leadMagnet) {
    const content = (leadMagnet.contentJson ?? {}) as LeadMagnetContent;

    return (
      <>
        <LeadMagnetView
          magnet={{ title: leadMagnet.title, magnetType: leadMagnet.magnetType }}
          content={content}
        />
        <footer
          style={{
            textAlign: "center",
            padding: "1.25rem",
            borderTop: "1px solid #e5e7eb",
            fontSize: "0.8rem",
            color: "#9ca3af",
            backgroundColor: "#f9fafb",
          }}
        >
          Powered by{" "}
          <span style={{ fontWeight: 700, color: BRAND_GREEN }}>ORION</span>
        </footer>
      </>
    );
  }

  notFound();
}
