"use client";

import { useState } from "react";

interface InstagramPreviewProps {
  content: string;
  brandName: string;
  brandLogo?: string;
  image?: string;
  channel?: string;
}

function toHandle(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9._]/g, "").slice(0, 30);
}

// Render caption with hashtags/mentions in IG blue
function CaptionText({ text }: { text: string }) {
  const parts = text.split(/(#\w+|@\w+)/g);
  return (
    <>
      {parts.map((part, i) =>
        /^[#@]\w+$/.test(part) ? (
          <span key={i} className="text-[#00376b] font-medium cursor-pointer">
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

export function InstagramPreview({ content, brandName, brandLogo, image }: InstagramPreviewProps) {
  const [captionExpanded, setCaptionExpanded] = useState(false);
  const [liked, setLiked] = useState(false);
  const [saved, setSaved] = useState(false);

  const handle = toHandle(brandName);
  const CAPTION_LIMIT = 125;
  const needsTrunc = content.length > CAPTION_LIMIT;
  const captionText = !captionExpanded && needsTrunc
    ? content.slice(0, CAPTION_LIMIT)
    : content;

  return (
    <div className="bg-white border border-[#dbdbdb] rounded-sm overflow-hidden max-w-[470px] w-full font-sans">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-3">
        <div className="flex items-center gap-3">
          {/* Avatar with gradient ring */}
          <div className="p-[2px] rounded-full bg-gradient-to-tr from-[#fd5949] via-[#d6249f] to-[#285AEB]">
            <div className="p-[2px] rounded-full bg-white">
              {brandLogo ? (
                <img
                  src={brandLogo}
                  alt={brandName}
                  className="h-8 w-8 rounded-full object-cover"
                />
              ) : (
                <div className="h-8 w-8 rounded-full bg-gradient-to-br from-[#833ab4] via-[#fd1d1d] to-[#fcb045] flex items-center justify-center text-white text-xs font-bold select-none">
                  <Initials name={brandName} />
                </div>
              )}
            </div>
          </div>
          <div>
            <p className="text-sm font-semibold text-[#000000e6] leading-tight">{handle}</p>
            <p className="text-[11px] text-[#737373]">Sponsored</p>
          </div>
        </div>
        <button className="text-[#000000e6] text-xl leading-none">···</button>
      </div>

      {/* Image */}
      <div className="w-full aspect-square bg-[#efefef] flex items-center justify-center border-y border-[#dbdbdb]">
        {image ? (
          <img src={image} alt="post" className="w-full h-full object-cover" />
        ) : (
          <div className="flex flex-col items-center gap-2 text-[#8e8e8e]">
            <svg className="h-10 w-10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <path d="M21 15l-5-5L5 21" />
            </svg>
            <span className="text-xs">No image</span>
          </div>
        )}
      </div>

      {/* Action row */}
      <div className="px-3 pt-2.5 pb-1 flex items-center justify-between">
        <div className="flex items-center gap-4">
          {/* Heart */}
          <button
            onClick={() => setLiked(!liked)}
            className="transition-transform active:scale-125"
          >
            {liked ? (
              <svg className="h-6 w-6 text-[#ed4956]" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
              </svg>
            ) : (
              <svg className="h-6 w-6 text-[#000000e6]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
                <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
          </button>
          {/* Comment */}
          <button>
            <svg className="h-6 w-6 text-[#000000e6]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
              <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          {/* Share/DM */}
          <button>
            <svg className="h-6 w-6 text-[#000000e6]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
              <line x1="22" y1="2" x2="11" y2="13" />
              <polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
          </button>
        </div>
        {/* Bookmark */}
        <button onClick={() => setSaved(!saved)}>
          {saved ? (
            <svg className="h-6 w-6 text-[#000000e6]" viewBox="0 0 24 24" fill="currentColor">
              <path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z" />
            </svg>
          ) : (
            <svg className="h-6 w-6 text-[#000000e6]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
              <path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
        </button>
      </div>

      {/* Likes */}
      <div className="px-3 pb-1">
        <p className="text-sm font-semibold text-[#000000e6]">
          {liked ? "You and " : ""}1,{liked ? "248" : "247"} likes
        </p>
      </div>

      {/* Caption */}
      <div className="px-3 pb-3">
        <p className="text-sm text-[#000000e6] leading-relaxed">
          <span className="font-semibold mr-1">{handle}</span>
          <CaptionText text={captionText} />
          {!captionExpanded && needsTrunc && (
            <>
              {"… "}
              <button
                onClick={() => setCaptionExpanded(true)}
                className="text-[#737373] font-normal"
              >
                more
              </button>
            </>
          )}
        </p>
        <button className="text-[#737373] text-sm mt-1">View all 14 comments</button>
        <p className="text-[#737373] text-[10px] uppercase tracking-wider mt-1.5">2 hours ago</p>
      </div>
    </div>
  );
}
