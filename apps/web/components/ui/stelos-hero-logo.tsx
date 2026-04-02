// Full animated STELOS brand lockup — gem + wordmark + tagline.
// Exact visual treatment from the STELOS brand kit primary logo section.

import { StelosGem } from "@/components/ui/stelos-gem";

export function StelosHeroLogo() {
  return (
    <div className="flex flex-col sm:flex-row items-center justify-center gap-6 sm:gap-8 mb-10">
      {/* Gem mark */}
      <StelosGem size={90} />

      {/* Vertical divider — hidden on mobile, shown on sm+ */}
      <div
        className="hidden sm:block shrink-0"
        style={{
          width: "1px",
          height: "72px",
          background: "linear-gradient(to bottom, transparent, rgba(139,92,246,0.95), rgba(109,40,217,0.95), transparent)",
          boxShadow: "0 0 16px rgba(124,58,237,0.6)",
        }}
      />

      {/* Wordmark + tagline */}
      <div className="flex flex-col items-center gap-0">
        <div className="flex items-baseline" style={{ gap: 0 }}>
          <span
            style={{
              fontFamily: "var(--font-brand)",
              fontWeight: 900,
              fontSize: "clamp(36px, 7vw, 64px)",
              letterSpacing: "-3.5px",
              lineHeight: 1,
              background: "linear-gradient(160deg, #ffffff 0%, #ede9fe 18%, #c4b5fd 42%, #8b5cf6 70%, #6d28d9 100%)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip: "text",
              animation: "stelGlow 4s ease-in-out infinite",
            }}
          >
            STEL
          </span>
          <span
            style={{
              fontFamily: "var(--font-brand)",
              fontWeight: 900,
              fontSize: "clamp(36px, 7vw, 64px)",
              letterSpacing: "-3.5px",
              lineHeight: 1,
              background: "linear-gradient(160deg, #a78bfa 0%, #7c3aed 35%, #6d28d9 65%, #4c1d95 100%)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip: "text",
              animation: "osGlow 4s ease-in-out infinite 1.5s",
            }}
          >
            OS
          </span>
        </div>

        {/* Tagline */}
        <p
          style={{
            fontFamily: "var(--font-brand)",
            fontWeight: 900,
            fontSize: "9px",
            letterSpacing: "7px",
            textTransform: "uppercase",
            color: "rgba(139,92,246,0.45)",
            marginTop: "-2px",
          }}
        >
          Marketing Operating System
        </p>
      </div>
    </div>
  );
}
