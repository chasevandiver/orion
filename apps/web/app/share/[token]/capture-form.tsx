"use client";

import { useState } from "react";

interface CaptureFormProps {
  formFields: string[];
  orgId: string;
  campaignId: string | null;
  sourceChannel: string;
  trackingId: string | null;
  captureEndpoint: string;
  buttonText: string;
  accentColor: string;
}

export function CaptureForm({
  formFields,
  orgId,
  campaignId,
  sourceChannel,
  trackingId,
  captureEndpoint,
  buttonText,
  accentColor,
}: CaptureFormProps) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<"idle" | "submitting" | "success" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  // Derive API-expected field names from display labels
  function toApiFields(raw: Record<string, string>) {
    const result: Record<string, string> = {};
    for (const [label, value] of Object.entries(raw)) {
      const key = label.toLowerCase();
      if (key.includes("email")) result.email = value;
      else if (key.includes("first") || key === "name") result.name = value;
      else if (key.includes("last")) result.lastName = value;
      else if (key.includes("company") || key.includes("organization")) result.company = value;
      else if (key.includes("phone")) result.phone = value;
      else result[key.replace(/\s+/g, "_")] = value;
    }
    return result;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("submitting");
    setErrorMsg("");

    const apiFields = toApiFields(values);
    const email = apiFields.email;
    if (!email) {
      setErrorMsg("Email is required.");
      setStatus("error");
      return;
    }

    try {
      const res = await fetch(captureEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orgId,
          email,
          name: apiFields.name || apiFields.lastName
            ? `${apiFields.name ?? ""} ${apiFields.lastName ?? ""}`.trim()
            : undefined,
          company: apiFields.company,
          phone: apiFields.phone,
          sourceChannel,
          ...(campaignId ? { sourceCampaignId: campaignId } : {}),
          ...(trackingId ? { trackingId } : {}),
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
      }

      setStatus("success");
    } catch (err) {
      setErrorMsg((err as Error).message || "Something went wrong. Please try again.");
      setStatus("error");
    }
  }

  if (status === "success") {
    return (
      <div
        style={{
          background: "rgba(255,255,255,0.15)",
          backdropFilter: "blur(8px)",
          borderRadius: "0.75rem",
          padding: "2rem",
          textAlign: "center",
          border: "1px solid rgba(255,255,255,0.3)",
        }}
      >
        <div style={{ fontSize: "2.5rem", marginBottom: "0.75rem" }}>✓</div>
        <p style={{ fontWeight: 700, fontSize: "1.1rem", color: "#fff" }}>You&apos;re in!</p>
        <p style={{ color: "rgba(255,255,255,0.85)", fontSize: "0.9rem", marginTop: "0.25rem" }}>
          We&apos;ll be in touch soon.
        </p>
      </div>
    );
  }

  return (
    <form
      id="cta-form"
      onSubmit={handleSubmit}
      style={{ display: "flex", flexDirection: "column", gap: "0.75rem", maxWidth: "400px", margin: "0 auto" }}
    >
      {formFields.map((label) => {
        const isEmail = label.toLowerCase().includes("email");
        const isPhone = label.toLowerCase().includes("phone");
        return (
          <input
            key={label}
            type={isEmail ? "email" : isPhone ? "tel" : "text"}
            placeholder={label}
            required={isEmail}
            value={values[label] ?? ""}
            onChange={(e) => setValues((prev) => ({ ...prev, [label]: e.target.value }))}
            style={{
              width: "100%",
              padding: "0.75rem 1rem",
              borderRadius: "0.5rem",
              border: "1px solid rgba(255,255,255,0.3)",
              background: "rgba(255,255,255,0.15)",
              color: "#fff",
              fontSize: "0.95rem",
              outline: "none",
              boxSizing: "border-box",
            }}
          />
        );
      })}

      {status === "error" && errorMsg && (
        <p style={{ color: "#fca5a5", fontSize: "0.85rem", margin: 0 }}>{errorMsg}</p>
      )}

      <button
        type="submit"
        disabled={status === "submitting"}
        style={{
          marginTop: "0.25rem",
          backgroundColor: "#fff",
          color: accentColor,
          padding: "0.875rem 2rem",
          borderRadius: "0.5rem",
          fontWeight: 700,
          fontSize: "1rem",
          border: "none",
          cursor: status === "submitting" ? "wait" : "pointer",
          opacity: status === "submitting" ? 0.7 : 1,
          boxShadow: "0 4px 20px rgba(0,0,0,0.15)",
        }}
      >
        {status === "submitting" ? "Submitting…" : buttonText}
      </button>
    </form>
  );
}
