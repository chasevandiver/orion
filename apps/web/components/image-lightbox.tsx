"use client";

import { createContext, useContext, useState, useCallback, useEffect } from "react";
import { X, ZoomIn } from "lucide-react";

// ── Context ───────────────────────────────────────────────────────────────────

interface LightboxContextValue {
  open: (src: string, alt: string) => void;
}

const LightboxContext = createContext<LightboxContextValue>({ open: () => {} });

export function useLightbox() {
  return useContext(LightboxContext);
}

// ── Provider ──────────────────────────────────────────────────────────────────

export function LightboxProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<{ src: string; alt: string } | null>(null);

  const open = useCallback((src: string, alt: string) => {
    setState({ src, alt });
  }, []);

  const close = useCallback(() => {
    setState(null);
  }, []);

  useEffect(() => {
    if (!state) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") close();
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [state, close]);

  return (
    <LightboxContext.Provider value={{ open }}>
      {children}
      {state && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm"
          onClick={close}
        >
          <button
            aria-label="Close"
            className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors"
            onClick={close}
          >
            <X className="h-5 w-5" />
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={state.src}
            alt={state.alt}
            className="max-h-[90vh] max-w-[90vw] object-contain rounded-lg shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </LightboxContext.Provider>
  );
}

// ── Reusable image component ──────────────────────────────────────────────────

interface ImageLightboxProps {
  src: string;
  alt: string;
  /** Applied to the <img> element — use for max-h, opacity, etc. */
  className?: string;
  /** Applied to the outer container div — use for max-h to constrain height. */
  containerClassName?: string;
}

export function ImageLightbox({
  src,
  alt,
  className,
  containerClassName,
}: ImageLightboxProps) {
  const { open } = useLightbox();

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`Enlarge image: ${alt}`}
      className={`group relative cursor-zoom-in overflow-hidden bg-black ${containerClassName ?? ""}`}
      onClick={() => open(src, alt)}
      onKeyDown={(e) => e.key === "Enter" && open(src, alt)}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        className={`w-full object-contain ${className ?? ""}`}
      />
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center opacity-0 transition-opacity group-hover:opacity-100 bg-black/20">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-black/60 text-white">
          <ZoomIn className="h-5 w-5" />
        </div>
      </div>
    </div>
  );
}
