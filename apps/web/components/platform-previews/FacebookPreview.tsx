"use client";

import { useState } from "react";

interface FacebookPreviewProps {
  content: string;
  brandName: string;
  brandLogo?: string;
  image?: string;
  channel?: string;
}

// Render post text with hashtags/mentions in FB blue
function FBText({ text }: { text: string }) {
  const parts = text.split(/(#\w+|@\w[\w.]*)/g);
  return (
    <>
      {parts.map((part, i) =>
        /^[#@]\w/.test(part) ? (
          <span key={i} className="text-[#1877f2] cursor-pointer hover:underline">
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

const PREVIEW_LIMIT = 240;

export function FacebookPreview({ content, brandName, brandLogo, image }: FacebookPreviewProps) {
  const [expanded, setExpanded] = useState(false);
  const [reaction, setReaction] = useState<null | "like" | "love" | "haha">(null);

  const needsTrunc = content.length > PREVIEW_LIMIT;
  const displayText = !expanded && needsTrunc ? content.slice(0, PREVIEW_LIMIT) : content;

  return (
    <div className="bg-white rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.18)] overflow-hidden max-w-[500px] w-full font-sans border border-[#e4e6eb]">
      {/* Post header */}
      <div className="flex items-start gap-3 px-4 pt-4 pb-3">
        {brandLogo ? (
          <img
            src={brandLogo}
            alt={brandName}
            className="h-10 w-10 rounded-full object-cover flex-shrink-0"
          />
        ) : (
          <div className="h-10 w-10 rounded-full bg-[#1877f2] flex items-center justify-center text-white text-sm font-bold flex-shrink-0 select-none">
            <Initials name={brandName} />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-[#050505] leading-tight hover:underline cursor-pointer">{brandName}</p>
          <div className="flex items-center gap-1 text-xs text-[#65676b] mt-0.5">
            <span>Just now</span>
            <span>·</span>
            {/* Globe icon */}
            <svg className="h-3 w-3" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z" />
            </svg>
          </div>
        </div>
        {/* Options */}
        <button className="h-8 w-8 rounded-full flex items-center justify-center text-[#65676b] hover:bg-[#e4e6eb] transition-colors text-xl leading-none">
          ···
        </button>
      </div>

      {/* Content */}
      <div className="px-4 pb-3">
        <p className="text-sm text-[#050505] leading-relaxed whitespace-pre-wrap break-words">
          <FBText text={displayText} />
          {!expanded && needsTrunc && (
            <>
              {"… "}
              <button
                onClick={() => setExpanded(true)}
                className="text-[#65676b] font-semibold hover:underline"
              >
                See more
              </button>
            </>
          )}
        </p>
      </div>

      {/* Optional image */}
      {image && (
        <div className="w-full border-y border-[#e4e6eb]">
          <img src={image} alt="post visual" className="w-full object-cover max-h-80" />
        </div>
      )}

      {/* Reaction summary */}
      <div className="px-4 py-2 flex items-center justify-between text-xs text-[#65676b] border-t border-[#e4e6eb]">
        <div className="flex items-center gap-1">
          <div className="flex -space-x-0.5">
            <span className="text-base">👍</span>
            <span className="text-base">❤️</span>
            <span className="text-base">😂</span>
          </div>
          <span className="hover:underline cursor-pointer ml-1">
            {reaction ? "You and 1,436 others" : "1,435"}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span className="hover:underline cursor-pointer">243 comments</span>
          <span className="hover:underline cursor-pointer">89 shares</span>
        </div>
      </div>

      {/* Engagement bar */}
      <div className="flex items-stretch border-t border-[#e4e6eb]">
        {/* Like (with reaction picker hint) */}
        <button
          onClick={() => setReaction(reaction === "like" ? null : "like")}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 hover:bg-[#e4e6eb] transition-colors text-sm font-semibold ${
            reaction === "like" ? "text-[#1877f2]" : "text-[#65676b]"
          }`}
        >
          {reaction === "like" ? (
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
              <path d="M1 21h4V9H1v12zm22-11c0-1.1-.9-2-2-2h-6.31l.95-4.57.03-.32c0-.41-.17-.79-.44-1.06L14.17 1 7.59 7.59C7.22 7.95 7 8.45 7 9v10c0 1.1.9 2 2 2h9c.83 0 1.54-.5 1.84-1.22l3.02-7.05c.09-.23.14-.47.14-.73v-2z" />
            </svg>
          ) : (
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
              <path d="M14 9V5a3 3 0 00-3-3l-4 9v11h11.28a2 2 0 002-1.7l1.38-9a2 2 0 00-2-2.3H14z" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M7 22H4a2 2 0 01-2-2v-7a2 2 0 012-2h3" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
          <span>Like</span>
        </button>

        {/* Comment */}
        <button className="flex-1 flex items-center justify-center gap-1.5 py-2.5 hover:bg-[#e4e6eb] transition-colors text-sm font-semibold text-[#65676b]">
          <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
            <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span>Comment</span>
        </button>

        {/* Share */}
        <button className="flex-1 flex items-center justify-center gap-1.5 py-2.5 hover:bg-[#e4e6eb] transition-colors text-sm font-semibold text-[#65676b]">
          <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
            <circle cx="18" cy="5" r="3" />
            <circle cx="6" cy="12" r="3" />
            <circle cx="18" cy="19" r="3" />
            <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
            <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
          </svg>
          <span>Share</span>
        </button>
      </div>
    </div>
  );
}
