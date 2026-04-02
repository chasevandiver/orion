"use client";

interface TwitterPreviewProps {
  content: string;
  brandName: string;
  brandLogo?: string;
  image?: string;
  channel?: string;
}

// Derive a @handle from the brand name
function toHandle(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 15);
}

// Render tweet text with hashtags/mentions/links in Twitter blue
function TweetText({ text }: { text: string }) {
  const parts = text.split(/(#\w+|@\w+|https?:\/\/\S+)/g);
  return (
    <>
      {parts.map((part, i) =>
        /^[#@]\w+$/.test(part) || /^https?:\/\//.test(part) ? (
          <span key={i} className="text-[#1d9bf0] cursor-pointer hover:underline">
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

// Split content into tweet thread if paragraphs are separated by double newlines
// and total length suggests multiple tweets
function splitToThread(content: string): string[] {
  const paragraphs = content.split(/\n\n+/).filter(Boolean);
  if (paragraphs.length <= 1) {
    // Try splitting at 280 chars along sentence boundaries
    if (content.length <= 280) return [content];
    const tweets: string[] = [];
    let remaining = content;
    while (remaining.length > 280) {
      let cut = remaining.slice(0, 280).lastIndexOf(" ");
      if (cut < 200) cut = 280;
      tweets.push(remaining.slice(0, cut).trim());
      remaining = remaining.slice(cut).trim();
    }
    if (remaining) tweets.push(remaining);
    return tweets;
  }
  // Merge short paragraphs, split long ones
  const tweets: string[] = [];
  let current = "";
  for (const para of paragraphs) {
    const candidate = current ? `${current}\n\n${para}` : para;
    if (candidate.length <= 280) {
      current = candidate;
    } else {
      if (current) tweets.push(current);
      current = para.slice(0, 280);
    }
  }
  if (current) tweets.push(current);
  return tweets;
}

function TweetCard({
  text,
  brandName,
  brandLogo,
  image,
  isThread,
  tweetIndex,
  totalTweets,
}: {
  text: string;
  brandName: string;
  brandLogo?: string;
  image?: string;
  isThread: boolean;
  tweetIndex: number;
  totalTweets: number;
}) {
  const handle = toHandle(brandName);
  const charCount = text.length;
  const overLimit = charCount > 280;

  return (
    <div className={`px-4 pt-4 pb-3 ${isThread && tweetIndex < totalTweets - 1 ? "border-b border-[#2f3336]" : ""}`}>
      <div className="flex gap-3">
        {/* Avatar + thread line */}
        <div className="flex flex-col items-center">
          {brandLogo ? (
            <img
              src={brandLogo}
              alt={brandName}
              className="h-10 w-10 rounded-full object-cover flex-shrink-0"
            />
          ) : (
            <div className="h-10 w-10 rounded-full bg-[#1d9bf0] flex items-center justify-center text-white text-xs font-bold flex-shrink-0 select-none">
              <Initials name={brandName} />
            </div>
          )}
          {isThread && tweetIndex < totalTweets - 1 && (
            <div className="w-0.5 flex-1 bg-[#2f3336] mt-2 mb-1 min-h-[24px]" />
          )}
        </div>

        {/* Tweet body */}
        <div className="flex-1 min-w-0">
          {/* Name row */}
          <div className="flex items-center gap-1 flex-wrap mb-0.5">
            <span className="text-sm font-bold text-[#e7e9ea] leading-tight">{brandName}</span>
            {/* Verified badge */}
            <svg className="h-4 w-4 text-[#1d9bf0] flex-shrink-0" viewBox="0 0 24 24" fill="currentColor">
              <path d="M22.25 12c0-1.43-.88-2.67-2.19-3.34.46-1.39.2-2.9-.81-3.91s-2.52-1.27-3.91-.81c-.66-1.31-1.91-2.19-3.34-2.19s-2.67.88-3.33 2.19c-1.4-.46-2.91-.2-3.92.81s-1.26 2.52-.8 3.91C3.13 9.33 2.25 10.57 2.25 12s.88 2.67 2.19 3.34c-.46 1.39-.2 2.9.81 3.91s2.52 1.26 3.91.8c.66 1.31 1.91 2.19 3.34 2.19s2.67-.88 3.33-2.19c1.4.46 2.91.2 3.92-.81s1.26-2.52.8-3.91C21.37 14.67 22.25 13.43 22.25 12zm-6.12-1.27l-3.83 5.04a.75.75 0 01-.56.28.75.75 0 01-.56-.24l-1.94-2.18a.75.75 0 011.12-1l1.35 1.52 3.29-4.32a.75.75 0 011.13.9z" />
            </svg>
            <span className="text-sm text-[#71767b] leading-tight">@{handle} · now</span>
          </div>

          {/* Tweet text */}
          <p className="text-sm text-[#e7e9ea] leading-relaxed whitespace-pre-wrap break-words">
            <TweetText text={text} />
          </p>

          {/* Image (only on first tweet of thread) */}
          {image && tweetIndex === 0 && (
            <div className="mt-3 rounded-2xl overflow-hidden border border-[#2f3336]">
              <img src={image} alt="tweet media" className="w-full object-cover max-h-72" />
            </div>
          )}

          {/* Char counter + stats */}
          <div className="flex items-center justify-between mt-3 text-[#71767b] text-xs">
            <div className="flex items-center gap-5">
              {/* Reply */}
              <button className="flex items-center gap-1.5 group hover:text-[#1d9bf0] transition-colors">
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
                  <path d="M1.5 12C1.5 6.201 6.201 1.5 12 1.5s10.5 4.701 10.5 10.5-4.701 10.5-10.5 10.5c-1.893 0-3.67-.5-5.207-1.378L2.5 22.5l1.378-4.793A10.455 10.455 0 011.5 12z" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <span>4</span>
              </button>
              {/* Retweet */}
              <button className="flex items-center gap-1.5 group hover:text-[#00ba7c] transition-colors">
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
                  <path d="M4 4v5h5M20 20v-5h-5" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M20 9a8 8 0 00-14.93-2M4 15a8 8 0 0014.93 2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <span>12</span>
              </button>
              {/* Like */}
              <button className="flex items-center gap-1.5 group hover:text-[#f91880] transition-colors">
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
                  <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <span>87</span>
              </button>
              {/* Views */}
              <button className="flex items-center gap-1.5 hover:text-[#1d9bf0] transition-colors">
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
                  <path d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <span>2.1K</span>
              </button>
            </div>
            <span className={`font-mono text-xs ${overLimit ? "text-red-400 font-bold" : charCount > 260 ? "text-yellow-400" : "text-[#71767b]"}`}>
              {overLimit ? `-${charCount - 280}` : `${280 - charCount}`}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

export function TwitterPreview({ content, brandName, brandLogo, image }: TwitterPreviewProps) {
  const tweets = splitToThread(content);
  const isThread = tweets.length > 1;

  return (
    <div className="rounded-2xl border border-[#2f3336] bg-black overflow-hidden max-w-[598px] w-full font-sans">
      {tweets.map((tweet, i) => (
        <TweetCard
          key={i}
          text={tweet}
          brandName={brandName}
          {...(brandLogo ? { brandLogo } : {})}
          {...(image ? { image } : {})}
          isThread={isThread}
          tweetIndex={i}
          totalTweets={tweets.length}
        />
      ))}

      {isThread && (
        <div className="px-4 pb-3 pt-1 border-t border-[#2f3336]">
          <button className="text-sm text-[#1d9bf0] hover:underline">
            Show this thread
          </button>
        </div>
      )}
    </div>
  );
}
