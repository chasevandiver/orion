"use client";

/**
 * LandingPagePreview — renders a landing page contentJson as a live React component.
 * Mirrors the template in /share/[token]/page.tsx so edits show in real-time.
 */

export interface LPContent {
  hero?: {
    headline?: string;
    subheadline?: string;
    ctaText?: string;
    ctaUrl?: string;
  };
  benefits?: Array<{ icon?: string; title?: string; description?: string }>;
  socialProof?: Array<{ quote?: string; author?: string; company?: string }>;
  faq?: Array<{ question?: string; answer?: string }>;
  cta?: {
    headline?: string;
    subtext?: string;
    buttonText?: string;
    buttonUrl?: string;
    formFields?: string[];
  };
  _brandColor?: string;
  _customDomain?: string;
  [key: string]: unknown;
}

interface Props {
  content: LPContent;
  title?: string;
}

export function LandingPagePreview({ content, title }: Props) {
  const { hero, benefits, socialProof, faq, cta } = content;
  const accent = content._brandColor || "#00ff88";
  const accentLight = `${accent}18`;
  const accentMid = `${accent}44`;

  return (
    <div
      style={{
        fontFamily: "system-ui, -apple-system, sans-serif",
        color: "#1a1a2e",
        fontSize: "14px",
        lineHeight: 1.5,
        transformOrigin: "top left",
      }}
    >
      {/* Hero */}
      <section
        style={{
          background: `linear-gradient(135deg, ${accentLight} 0%, #8b5cf622 100%)`,
          padding: "3rem 1.25rem 2.5rem",
          textAlign: "center",
        }}
      >
        <div style={{ maxWidth: "560px", margin: "0 auto" }}>
          {hero?.headline ? (
            <h1
              style={{
                fontSize: "clamp(1.5rem, 4vw, 2.5rem)",
                fontWeight: 800,
                lineHeight: 1.15,
                marginBottom: "1rem",
                color: "#0f0f23",
              }}
            >
              {hero.headline}
            </h1>
          ) : (
            <div style={{ height: "3rem", background: "#e5e7eb", borderRadius: "0.5rem", marginBottom: "1rem" }} />
          )}
          {hero?.subheadline && (
            <p style={{ fontSize: "1rem", color: "#4b5563", lineHeight: 1.6, marginBottom: "1.5rem" }}>
              {hero.subheadline}
            </p>
          )}
          {hero?.ctaText && (
            <span
              style={{
                display: "inline-block",
                backgroundColor: accent,
                color: "#fff",
                padding: "0.75rem 2rem",
                borderRadius: "0.5rem",
                fontWeight: 700,
                fontSize: "0.95rem",
                boxShadow: `0 4px 16px ${accentMid}`,
                cursor: "default",
              }}
            >
              {hero.ctaText}
            </span>
          )}
        </div>
      </section>

      {/* Benefits */}
      {benefits && benefits.length > 0 && (
        <section style={{ padding: "2.5rem 1.25rem", maxWidth: "800px", margin: "0 auto" }}>
          <h2
            style={{
              textAlign: "center",
              fontSize: "1.35rem",
              fontWeight: 700,
              marginBottom: "1.75rem",
              color: "#0f0f23",
            }}
          >
            Why It Works
          </h2>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
              gap: "1rem",
            }}
          >
            {benefits.map((b, i) => (
              <div
                key={i}
                style={{
                  background: "#fff",
                  border: "1px solid #e5e7eb",
                  borderRadius: "0.625rem",
                  padding: "1.25rem",
                  boxShadow: "0 1px 4px rgba(0,0,0,0.05)",
                }}
              >
                <div
                  style={{
                    width: "2rem",
                    height: "2rem",
                    borderRadius: "50%",
                    backgroundColor: accentLight,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    marginBottom: "0.75rem",
                    fontSize: "1rem",
                  }}
                >
                  {b.icon || String(i + 1)}
                </div>
                {b.title && (
                  <h3 style={{ fontWeight: 700, marginBottom: "0.4rem", color: "#111827", fontSize: "0.9rem" }}>
                    {b.title}
                  </h3>
                )}
                {b.description && (
                  <p style={{ color: "#6b7280", lineHeight: 1.55, fontSize: "0.82rem" }}>
                    {b.description}
                  </p>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Social Proof */}
      {socialProof && socialProof.length > 0 && (
        <section
          style={{
            backgroundColor: "#f9fafb",
            padding: "2.5rem 1.25rem",
            borderTop: "1px solid #e5e7eb",
            borderBottom: "1px solid #e5e7eb",
          }}
        >
          <div style={{ maxWidth: "800px", margin: "0 auto" }}>
            <h2
              style={{
                textAlign: "center",
                fontSize: "1.35rem",
                fontWeight: 700,
                marginBottom: "1.75rem",
                color: "#0f0f23",
              }}
            >
              What People Are Saying
            </h2>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                gap: "1rem",
              }}
            >
              {socialProof.map((item, i) => (
                <div
                  key={i}
                  style={{
                    background: "#fff",
                    border: "1px solid #e5e7eb",
                    borderRadius: "0.625rem",
                    padding: "1.25rem",
                    boxShadow: "0 1px 4px rgba(0,0,0,0.04)",
                  }}
                >
                  <p style={{ fontSize: "0.85rem", color: "#374151", lineHeight: 1.6, fontStyle: "italic", marginBottom: "0.75rem" }}>
                    &ldquo;{item.quote}&rdquo;
                  </p>
                  <div style={{ fontSize: "0.78rem" }}>
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
        <section style={{ padding: "2.5rem 1.25rem", maxWidth: "600px", margin: "0 auto" }}>
          <h2
            style={{
              textAlign: "center",
              fontSize: "1.35rem",
              fontWeight: 700,
              marginBottom: "1.75rem",
              color: "#0f0f23",
            }}
          >
            Frequently Asked Questions
          </h2>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            {faq.map((item, i) => (
              <div
                key={i}
                style={{
                  background: "#fff",
                  border: "1px solid #e5e7eb",
                  borderRadius: "0.5rem",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    padding: "0.875rem 1rem",
                    fontWeight: 600,
                    color: "#111827",
                    fontSize: "0.85rem",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: "0.5rem",
                  }}
                >
                  {item.question}
                  <span style={{ color: accent, flexShrink: 0 }}>+</span>
                </div>
                {item.answer && (
                  <div
                    style={{
                      padding: "0 1rem 0.875rem",
                      color: "#4b5563",
                      lineHeight: 1.6,
                      fontSize: "0.82rem",
                      borderTop: "1px solid #f3f4f6",
                    }}
                  >
                    {item.answer}
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* CTA */}
      {cta && (
        <section
          style={{
            background: `linear-gradient(135deg, ${accent} 0%, #8b5cf6 100%)`,
            padding: "2.5rem 1.25rem",
            textAlign: "center",
            color: "#fff",
          }}
        >
          <div style={{ maxWidth: "520px", margin: "0 auto" }}>
            {cta.headline && (
              <h2 style={{ fontSize: "1.5rem", fontWeight: 800, marginBottom: "0.75rem" }}>
                {cta.headline}
              </h2>
            )}
            {cta.subtext && (
              <p style={{ fontSize: "0.9rem", opacity: 0.9, marginBottom: "1.5rem", lineHeight: 1.6 }}>
                {cta.subtext}
              </p>
            )}
            {cta.formFields && cta.formFields.length > 0 ? (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", maxWidth: "320px", margin: "0 auto" }}>
                {cta.formFields.map((field, i) => (
                  <div
                    key={i}
                    style={{
                      background: "rgba(255,255,255,0.15)",
                      border: "1px solid rgba(255,255,255,0.3)",
                      borderRadius: "0.375rem",
                      padding: "0.6rem 0.875rem",
                      fontSize: "0.82rem",
                      color: "rgba(255,255,255,0.8)",
                      textAlign: "left",
                    }}
                  >
                    {field}
                  </div>
                ))}
                <span
                  style={{
                    display: "block",
                    backgroundColor: "#fff",
                    color: accent,
                    padding: "0.7rem 1.5rem",
                    borderRadius: "0.375rem",
                    fontWeight: 700,
                    fontSize: "0.9rem",
                    marginTop: "0.25rem",
                    cursor: "default",
                  }}
                >
                  {cta.buttonText || "Get Started"}
                </span>
              </div>
            ) : cta.buttonText ? (
              <span
                style={{
                  display: "inline-block",
                  backgroundColor: "#fff",
                  color: accent,
                  padding: "0.75rem 2rem",
                  borderRadius: "0.375rem",
                  fontWeight: 700,
                  fontSize: "0.9rem",
                  cursor: "default",
                }}
              >
                {cta.buttonText}
              </span>
            ) : null}
          </div>
        </section>
      )}

      {/* Footer */}
      <div
        style={{
          textAlign: "center",
          padding: "1rem",
          borderTop: "1px solid #e5e7eb",
          fontSize: "0.72rem",
          color: "#9ca3af",
          backgroundColor: "#f9fafb",
        }}
      >
        Powered by <span style={{ fontWeight: 700, color: accent }}>STELOS</span>
      </div>
    </div>
  );
}
