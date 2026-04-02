"use client";

import { useState } from "react";

interface LinkedInPreviewProps {
  content: string;
  brandName: string;
  brandLogo?: string;
  image?: string;
  channel?: string;
}

// Render text with hashtags/mentions styled in LinkedIn blue
function LinkedInText({ text }: { text: string }) {
  const parts = text.split(/(#\w+|@\w+)/g);
  return (
    <>
      {parts.map((part, i) =>
        /^[#@]\w+$/.test(part) ? (
          <span key={i} className="text-[#0a66c2] font-medium cursor-pointer hover:underline">
            {part}
          </span>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </>
  );
}

function Initials({ name }: { name: string }) {
  const parts = name.trim().split(/\s+/);
  const initials = parts.length >= 2
    ? (parts[0]![0] ?? "") + (parts[parts.length - 1]![0] ?? "")
    : (parts[0]?.slice(0, 2) ?? "");
  return <>{initials.toUpperCase()}</>;
}

export function LinkedInPreview({ content, brandName, brandLogo, image }: LinkedInPreviewProps) {
  const [expanded, setExpanded] = useState(false);

  const PREVIEW_LIMIT = 220;
  const needsTruncation = content.length > PREVIEW_LIMIT;
  const displayText = !expanded && needsTruncation
    ? content.slice(0, PREVIEW_LIMIT)
    : content;

  return (
    <div className="rounded-lg border border-[#e0e0e0] bg-white shadow-sm overflow-hidden max-w-[552px] w-full font-sans">
      {/* Header */}
      <div className="flex items-start gap-3 px-4 pt-4 pb-3">
        {brandLogo ? (
          <img
            src={brandLogo}
            alt={brandName}
            className="h-12 w-12 rounded-full object-cover flex-shrink-0"
          />
        ) : (
          <div className="h-12 w-12 rounded-full bg-[#0a66c2] flex items-center justify-center text-white text-sm font-bold flex-shrink-0 select-none">
            <Initials name={brandName} />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-sm font-semibold text-[#000000e6] leading-tight">{brandName}</span>
            <span className="text-xs text-[#0a66c2] border border-[#0a66c2] rounded-full px-1.5 py-0 leading-tight font-medium">
              1st
            </span>
          </div>
          <p className="text-xs text-[#00000099] mt-0.5 leading-tight">Company · Marketing</p>
          <p className="text-xs text-[#00000099] leading-tight flex items-center gap-1">
            Just now ·
            <svg className="h-3 w-3 inline" viewBox="0 0 16 16" fill="currentColor">
              <path d="M8 0a8 8 0 100 16A8 8 0 008 0zM4.5 7.5a3.5 3.5 0 117 0 3.5 3.5 0 01-7 0z" />
            </svg>
          </p>
        </div>
        <button className="text-[#0a66c2] text-sm font-semibold border border-[#0a66c2] rounded-full px-3 py-1 hover:bg-[#0a66c2]/10 transition-colors whitespace-nowrap">
          + Follow
        </button>
      </div>

      {/* Content */}
      <div className="px-4 pb-3">
        <p className="text-sm text-[#000000e6] leading-relaxed whitespace-pre-wrap break-words">
          <LinkedInText text={displayText} />
          {!expanded && needsTruncation && (
            <>
              {"… "}
              <button
                onClick={() => setExpanded(true)}
                className="text-[#00000099] font-semibold hover:text-[#000000e6] transition-colors"
              >
                see more
              </button>
            </>
          )}
          {expanded && needsTruncation && (
            <>
              {" "}
              <button
                onClick={() => setExpanded(false)}
                className="text-[#00000099] font-semibold hover:text-[#000000e6] transition-colors"
              >
                see less
              </button>
            </>
          )}
        </p>
      </div>

      {/* Optional image */}
      {image && (
        <div className="w-full border-t border-[#e0e0e0]">
          <img src={image} alt="post visual" className="w-full object-cover max-h-72" />
        </div>
      )}

      {/* Reaction row */}
      <div className="px-4 py-2 flex items-center gap-1 text-xs text-[#00000099] border-t border-[#e0e0e0] mt-1">
        <div className="flex -space-x-0.5 mr-1">
          <span className="text-base">👍</span>
          <span className="text-base">❤️</span>
          <span className="text-base">💡</span>
        </div>
        <span className="hover:text-[#0a66c2] hover:underline cursor-pointer">42 reactions</span>
        <span className="ml-auto hover:text-[#0a66c2] hover:underline cursor-pointer">8 comments · 3 reposts</span>
      </div>

      {/* Engagement bar */}
      <div className="flex items-center px-2 py-1 border-t border-[#e0e0e0]">
        {[
          { icon: "👍", label: "Like" },
          { icon: "💬", label: "Comment" },
          { icon: "↗️", label: "Repost" },
          { icon: "✉️", label: "Send" },
        ].map(({ icon, label }) => (
          <button
            key={label}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded hover:bg-[#f3f2ef] text-xs font-semibold text-[#00000099] hover:text-[#000000e6] transition-colors"
          >
            <span>{icon}</span>
            <span>{label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
