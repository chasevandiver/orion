"use client";

import { useState } from "react";
import { api } from "@/lib/api-client";
import { useAppToast } from "@/hooks/use-app-toast";
import { Send, Loader2 } from "lucide-react";

interface EmailPreviewProps {
  content: string;
  brandName: string;
  brandLogo?: string;
  image?: string;
  channel?: string;
}

function Initials({ name }: { name: string }) {
  const parts = name.trim().split(/\s+/);
  const initials = parts.length >= 2
    ? (parts[0]![0] ?? "") + (parts[parts.length - 1]![0] ?? "")
    : (parts[0]?.slice(0, 2) ?? "");
  return <>{initials.toUpperCase()}</>;
}

// Parse email content: first non-empty line → subject, rest → body
function parseEmail(content: string): { subject: string; preheader: string; body: string } {
  const lines = content.split("\n");
  let subjectLine = "";
  let bodyStart = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!.trim();
    if (line) {
      if (/^subject:/i.test(line)) {
        subjectLine = line.replace(/^subject:\s*/i, "");
        bodyStart = i + 1;
      } else {
        subjectLine = line;
        bodyStart = i + 1;
      }
      break;
    }
  }

  const bodyLines = lines.slice(bodyStart);
  const preheader = bodyLines.find(l => l.trim())?.trim().slice(0, 90) ?? "";
  const body = bodyLines.join("\n").trim();

  return { subject: subjectLine, preheader, body };
}

function senderEmail(name: string): string {
  const domain = name.toLowerCase().replace(/[^a-z0-9]/g, "") || "company";
  return `hello@${domain}.com`;
}

// ── Send Test Email button ─────────────────────────────────────────────────────

function SendTestButton({ subject, body }: { subject: string; body: string }) {
  const toast = useAppToast();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);

  async function handleSend() {
    if (!email.trim()) return;
    setSending(true);
    try {
      await api.post("/broadcasts/test", { subject, body, toEmail: email.trim() });
      toast.success(`Test email sent to ${email.trim()}`);
      setOpen(false);
      setEmail("");
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to send test email");
    } finally {
      setSending(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded border border-[#e2e8f0] bg-white px-3 py-1.5 text-xs text-[#64748b] hover:bg-[#f8fafc] hover:text-[#0f172a] transition-colors"
      >
        <Send className="h-3 w-3" />
        Send Test
      </button>
    );
  }

  return (
    <div className="inline-flex items-center gap-1.5">
      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") handleSend(); if (e.key === "Escape") setOpen(false); }}
        placeholder="your@email.com"
        className="rounded border border-[#e2e8f0] bg-white px-2 py-1 text-xs text-[#0f172a] outline-none focus:border-[#6366f1] w-44"
        autoFocus
      />
      <button
        onClick={handleSend}
        disabled={sending || !email.trim()}
        className="inline-flex items-center gap-1 rounded border border-[#6366f1] bg-[#6366f1] px-2.5 py-1 text-xs font-medium text-white hover:bg-[#4f46e5] disabled:opacity-50 transition-colors"
      >
        {sending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
        Send
      </button>
      <button
        onClick={() => setOpen(false)}
        className="text-xs text-[#94a3b8] hover:text-[#64748b] transition-colors"
      >
        Cancel
      </button>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function EmailPreview({ content, brandName, brandLogo }: EmailPreviewProps) {
  const { subject, preheader, body } = parseEmail(content);
  const from = senderEmail(brandName);

  return (
    <div className="space-y-2">
      {/* Send Test button — sits above the preview */}
      <div className="flex justify-end">
        <SendTestButton subject={subject || "Email Preview"} body={body || content} />
      </div>

      <div className="rounded-lg overflow-hidden max-w-[600px] w-full font-sans border border-[#e2e8f0] shadow-sm">
        {/* Gmail-style inbox header */}
        <div className="bg-white px-4 py-2 border-b border-[#e2e8f0] flex items-center gap-2">
          <div className="flex gap-1.5">
            <div className="h-3 w-3 rounded-full bg-[#ff5f57]" />
            <div className="h-3 w-3 rounded-full bg-[#ffbd2e]" />
            <div className="h-3 w-3 rounded-full bg-[#28c840]" />
          </div>
          <div className="flex-1 text-center text-xs text-[#64748b] font-medium truncate">
            {subject || "Email Preview"}
          </div>
        </div>

        {/* Email client chrome */}
        <div className="bg-[#f8fafc]">
          {/* Subject + meta */}
          <div className="px-5 pt-4 pb-3 border-b border-[#e2e8f0] bg-white">
            <h1 className="text-lg font-bold text-[#0f172a] leading-tight mb-3 break-words">
              {subject || "(No subject)"}
            </h1>
            <div className="flex items-start gap-3">
              {brandLogo ? (
                <img
                  src={brandLogo}
                  alt={brandName}
                  className="h-10 w-10 rounded-full object-cover flex-shrink-0 mt-0.5"
                />
              ) : (
                <div className="h-10 w-10 rounded-full bg-[#6366f1] flex items-center justify-center text-white text-sm font-bold flex-shrink-0 mt-0.5 select-none">
                  <Initials name={brandName} />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline justify-between flex-wrap gap-2">
                  <div>
                    <span className="text-sm font-semibold text-[#0f172a]">{brandName}</span>
                    <span className="text-xs text-[#64748b] ml-1.5">&lt;{from}&gt;</span>
                  </div>
                  <span className="text-xs text-[#94a3b8] whitespace-nowrap">Just now</span>
                </div>
                <p className="text-xs text-[#64748b] mt-0.5">To: me</p>
              </div>
            </div>
          </div>

          {/* Email body */}
          <div className="bg-white px-5 pt-5 pb-6">
            {preheader && body && (
              <p className="text-xs text-[#94a3b8] italic mb-4 border-l-2 border-[#e2e8f0] pl-3">
                {preheader}…
              </p>
            )}

            <div className="text-sm text-[#1e293b] leading-relaxed whitespace-pre-wrap break-words space-y-3">
              {(body || content).split(/\n\n+/).map((para, i) => (
                <p key={i}>{para.trim()}</p>
              ))}
            </div>

            {/\b(shop now|learn more|get started|sign up|claim|register|book|try free|download|view|explore)\b/i.test(body || content) && (
              <div className="mt-5">
                <button className="inline-block bg-[#6366f1] text-white text-sm font-semibold px-5 py-2.5 rounded-lg hover:bg-[#4f46e5] transition-colors">
                  {(body || content).match(/\b(Shop Now|Learn More|Get Started|Sign Up|Claim|Register|Book|Try Free|Download|View|Explore)\b/i)?.[0] ?? "Learn More"}
                </button>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="bg-[#f8fafc] border-t border-[#e2e8f0] px-5 py-3 flex items-center justify-between flex-wrap gap-2">
            <p className="text-xs text-[#94a3b8]">
              © {new Date().getFullYear()} {brandName}. All rights reserved.
            </p>
            <div className="flex items-center gap-3 text-xs text-[#64748b]">
              <button className="hover:text-[#0f172a] transition-colors">Unsubscribe</button>
              <span className="text-[#e2e8f0]">·</span>
              <button className="hover:text-[#0f172a] transition-colors">View in browser</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
