"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { api } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Building2,
  Users,
  Plug,
  Loader2,
  Trash2,
  CheckCircle2,
  XCircle,
  Linkedin,
  Twitter,
  Instagram,
  Facebook,
  Mail,
  Zap,
  FileText,
  Save,
  Palette,
  UserCircle2,
  Plus,
  Pencil,
  Camera,
  Upload,
  Send,
  Copy,
  Clock,
  Mic,
  RefreshCw,
  Link2,
  MessageSquare,
  MapPin,
} from "lucide-react";
import { useAppToast } from "@/hooks/use-app-toast";
import { TooltipHelp } from "@/components/ui/tooltip-help";

interface OrgData {
  id: string;
  name: string;
  slug: string;
  website?: string;
  logoUrl?: string;
  plan: string;
  createdAt: Date | string;
  brandPrimaryColor?: string;
  brandSecondaryColor?: string;
  fontPreference?: string;
  logoPosition?: string;
  inspirationImageUrl?: string;
  autoPublishEnabled?: boolean;
  autoPublishThreshold?: number;
  timezone?: string;
  autoUtmEnabled?: boolean;
  evergreenEnabled?: boolean;
  evergreenMinAgeDays?: number;
  evergreenMinEngagementMultiplier?: number;
  evergreenMaxRecycles?: number;
  reportLogoUrl?: string;
  reportAccentColor?: string;
  reportSections?: string[];
  reportFooterText?: string;
}

interface Member {
  id: string;
  email: string;
  name?: string;
  image?: string;
  role: string;
  createdAt: Date | string;
}

interface Integration {
  id: string;
  channel: string;
  accountName?: string;
  accountId?: string;
  isActive: boolean;
  connectedAt: string;
  tokenExpiresAt?: string;
}

interface Persona {
  id: string;
  orgId: string;
  name: string;
  demographics?: string;
  psychographics?: string;
  painPoints?: string;
  preferredChannels: string[];
  createdAt: Date | string;
}

interface Invitation {
  id: string;
  email: string;
  role: string;
  status: string;
  expiresAt: string;
  createdAt: Date | string;
  inviteLink: string;
}

interface BrandVoiceProfile {
  tone: string;
  vocabulary: string[];
  bannedPhrases: string[];
  sentenceLengthPreference: "short" | "medium" | "long";
  ctaStyle: string;
  formality: "casual" | "professional" | "technical";
  emojiUsage: "none" | "minimal" | "frequent";
  exampleGoodCopy: string;
  lastUpdated?: string;
}

interface SettingsPanelProps {
  org: OrgData;
  members: Member[];
  integrations: Integration[];
  personas?: Persona[];
  currentUserId: string;
  currentUserRole: string;
}

const CHANNEL_ICONS: Record<string, React.ReactNode> = {
  linkedin:         <Linkedin      className="h-4 w-4" />,
  twitter:          <Twitter       className="h-4 w-4" />,
  instagram:        <Instagram     className="h-4 w-4" />,
  facebook:         <Facebook      className="h-4 w-4" />,
  email:            <Mail          className="h-4 w-4" />,
  blog:             <FileText      className="h-4 w-4" />,
  tiktok:           <Zap           className="h-4 w-4" />,
  sms:              <MessageSquare className="h-4 w-4" />,
  google_business:  <MapPin        className="h-4 w-4" />,
};

const CHANNEL_LABELS: Record<string, string> = {
  google_business: "Google Business",
};

function channelLabel(ch: string): string {
  return CHANNEL_LABELS[ch] ?? ch;
}

const PLAN_COLORS: Record<string, string> = {
  free: "bg-muted text-muted-foreground border-border",
  pro: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  enterprise: "bg-orion-green/10 text-orion-green border-orion-green/20",
};

const ROLE_COLORS: Record<string, string> = {
  owner: "bg-orion-green/10 text-orion-green border-orion-green/20",
  admin: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  editor: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
  viewer: "bg-muted text-muted-foreground border-border",
  member: "bg-muted text-muted-foreground border-border",
};

const ALL_CHANNELS = ["linkedin", "twitter", "instagram", "facebook", "tiktok", "email", "sms", "blog", "website"];

const FONT_OPTIONS = [
  { value: "modern", label: "Modern (sans-serif)" },
  { value: "serif", label: "Serif (editorial)" },
  { value: "minimal", label: "Minimal (light weight)" },
  { value: "bold", label: "Bold (heavy weight)" },
];

const LOGO_POSITION_OPTIONS = [
  { value: "auto", label: "Auto" },
  { value: "top-left", label: "Top Left" },
  { value: "top-right", label: "Top Right" },
  { value: "bottom-left", label: "Bottom Left" },
  { value: "bottom-right", label: "Bottom Right" },
];

const TIMEZONES = [
  // United States
  { value: "America/New_York",    label: "Eastern Time (ET) — New York" },
  { value: "America/Chicago",     label: "Central Time (CT) — Chicago" },
  { value: "America/Denver",      label: "Mountain Time (MT) — Denver" },
  { value: "America/Los_Angeles", label: "Pacific Time (PT) — Los Angeles" },
  { value: "America/Anchorage",   label: "Alaska Time — Anchorage" },
  { value: "Pacific/Honolulu",    label: "Hawaii Time — Honolulu" },
  // Canada
  { value: "America/Toronto",     label: "Eastern Time — Toronto" },
  { value: "America/Vancouver",   label: "Pacific Time — Vancouver" },
  // Latin America
  { value: "America/Mexico_City", label: "Central Time — Mexico City" },
  { value: "America/Sao_Paulo",   label: "Brasília Time — São Paulo" },
  { value: "America/Buenos_Aires",label: "Argentina Time — Buenos Aires" },
  // Europe
  { value: "Europe/London",       label: "GMT/BST — London" },
  { value: "Europe/Paris",        label: "CET/CEST — Paris" },
  { value: "Europe/Berlin",       label: "CET/CEST — Berlin" },
  { value: "Europe/Rome",         label: "CET/CEST — Rome" },
  { value: "Europe/Madrid",       label: "CET/CEST — Madrid" },
  { value: "Europe/Amsterdam",    label: "CET/CEST — Amsterdam" },
  { value: "Europe/Stockholm",    label: "CET/CEST — Stockholm" },
  { value: "Europe/Helsinki",     label: "EET/EEST — Helsinki" },
  { value: "Europe/Athens",       label: "EET/EEST — Athens" },
  { value: "Europe/Moscow",       label: "MSK — Moscow" },
  // Middle East & Africa
  { value: "Asia/Dubai",          label: "GST — Dubai" },
  { value: "Africa/Cairo",        label: "EET — Cairo" },
  { value: "Africa/Johannesburg", label: "SAST — Johannesburg" },
  // Asia
  { value: "Asia/Kolkata",        label: "IST — India" },
  { value: "Asia/Bangkok",        label: "ICT — Bangkok" },
  { value: "Asia/Singapore",      label: "SGT — Singapore" },
  { value: "Asia/Hong_Kong",      label: "HKT — Hong Kong" },
  { value: "Asia/Shanghai",       label: "CST — Shanghai" },
  { value: "Asia/Tokyo",          label: "JST — Tokyo" },
  { value: "Asia/Seoul",          label: "KST — Seoul" },
  // Australia & Pacific
  { value: "Australia/Sydney",    label: "AEST/AEDT — Sydney" },
  { value: "Australia/Brisbane",  label: "AEST — Brisbane" },
  { value: "Pacific/Auckland",    label: "NZST/NZDT — Auckland" },
  // UTC
  { value: "UTC",                 label: "UTC" },
];

const EMPTY_PERSONA_FORM = {
  name: "",
  demographics: "",
  psychographics: "",
  painPoints: "",
  preferredChannels: [] as string[],
};

export function SettingsPanel({
  org: initialOrg,
  members: initialMembers,
  integrations: initialIntegrations,
  personas: initialPersonas,
  currentUserId,
  currentUserRole,
}: SettingsPanelProps) {
  const toast = useAppToast();
  const [org, setOrg] = useState(initialOrg);
  const [members, setMembers] = useState(initialMembers ?? []);
  const [integrations, setIntegrations] = useState(initialIntegrations ?? []);
  const [personas, setPersonas] = useState(initialPersonas ?? []);

  // Org form (includes brand design fields)
  const [orgForm, setOrgForm] = useState({
    name: org.name,
    website: org.website ?? "",
    logoUrl: org.logoUrl ?? "",
    brandPrimaryColor: org.brandPrimaryColor ?? "#10b981",
    brandSecondaryColor: org.brandSecondaryColor ?? "#3b82f6",
    fontPreference: org.fontPreference ?? "",
    logoPosition: org.logoPosition ?? "auto",
    inspirationImageUrl: org.inspirationImageUrl ?? "",
    timezone: org.timezone ?? "America/Chicago",
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Auto-publish state
  const [autoPublishEnabled, setAutoPublishEnabled] = useState(org.autoPublishEnabled ?? false);
  const [autoPublishThreshold, setAutoPublishThreshold] = useState(org.autoPublishThreshold ?? 80);
  const [savingAutoPublish, setSavingAutoPublish] = useState(false);

  // UTM state
  const [autoUtmEnabled, setAutoUtmEnabled] = useState(org.autoUtmEnabled ?? true);
  const [savingUtm, setSavingUtm] = useState(false);

  // Evergreen recycling state
  const [evergreenEnabled, setEvergreenEnabled] = useState(org.evergreenEnabled ?? false);
  const [evergreenMinAgeDays, setEvergreenMinAgeDays] = useState(org.evergreenMinAgeDays ?? 30);
  const [evergreenMinEngagementMultiplier, setEvergreenMinEngagementMultiplier] = useState(
    org.evergreenMinEngagementMultiplier ?? 1.5,
  );
  const [evergreenMaxRecycles, setEvergreenMaxRecycles] = useState(org.evergreenMaxRecycles ?? 3);
  const [savingEvergreen, setSavingEvergreen] = useState(false);

  // Logo upload state
  const [logoUploading, setLogoUploading] = useState(false);
  const [logoError, setLogoError] = useState<string | null>(null);
  const [logoDragOver, setLogoDragOver] = useState(false);
  const logoFileInputRef = useRef<HTMLInputElement>(null);

  // Integrations state
  const [removingMember, setRemovingMember] = useState<string | null>(null);

  // Invite state
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [invitationsLoaded, setInvitationsLoaded] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"admin" | "editor" | "viewer">("viewer");
  const [inviting, setInviting] = useState(false);
  const [inviteError, setInviteError] = useState("");
  const [inviteSuccess, setInviteSuccess] = useState("");
  const [resendingInvite, setResendingInvite] = useState<string | null>(null);
  const [copiedInvite, setCopiedInvite] = useState<string | null>(null);

  const [disconnecting, setDisconnecting] = useState<string | null>(null);
  const [validating, setValidating] = useState<string | null>(null);
  const [validationResults, setValidationResults] = useState<
    Record<string, { valid: boolean; errorMessage?: string; checkedAt: string }>
  >({});

  // Twilio / SMS integration state
  const [twilioAccountSid, setTwilioAccountSid] = useState("");
  const [twilioAuthToken, setTwilioAuthToken] = useState("");
  const [twilioFromPhone, setTwilioFromPhone] = useState("");
  const [savingTwilio, setSavingTwilio] = useState(false);

  // Personas state
  const [personaForm, setPersonaForm] = useState(EMPTY_PERSONA_FORM);
  const [editingPersonaId, setEditingPersonaId] = useState<string | null>(null);
  const [showPersonaForm, setShowPersonaForm] = useState(false);
  const [savingPersona, setSavingPersona] = useState(false);
  const [deletingPersonaId, setDeletingPersonaId] = useState<string | null>(null);

  // Brand voice state
  const [voiceEditCount, setVoiceEditCount] = useState<number | null>(null);
  const [voiceProfile, setVoiceProfile] = useState<BrandVoiceProfile | null>(null);
  const [voiceLoading, setVoiceLoading] = useState(false);
  const [voiceRegenerating, setVoiceRegenerating] = useState(false);

  // Report settings state
  const ALL_REPORT_SECTIONS = [
    { value: "cover", label: "Cover Page" },
    { value: "executive_summary", label: "Executive Summary" },
    { value: "key_metrics", label: "Key Metrics" },
    { value: "channel_breakdown", label: "Per-Channel Breakdown" },
    { value: "top_content", label: "Top Performing Content" },
    { value: "recommendations", label: "Recommendations" },
  ] as const;
  const [reportAccentColor, setReportAccentColor] = useState(org.reportAccentColor ?? "");
  const [reportFooterText, setReportFooterText] = useState(org.reportFooterText ?? "");
  const [reportSections, setReportSections] = useState<string[]>(
    org.reportSections ?? ALL_REPORT_SECTIONS.map((s) => s.value),
  );
  const [reportLogoUrl, setReportLogoUrl] = useState(org.reportLogoUrl ?? "");
  const [reportLogoUploading, setReportLogoUploading] = useState(false);
  const [savingReport, setSavingReport] = useState(false);
  const [savedReport, setSavedReport] = useState(false);
  const reportLogoInputRef = useRef<HTMLInputElement>(null);

  // Integration provider config — fetched once, non-blocking
  const [integrationConfig, setIntegrationConfig] = useState<{
    linkedin: boolean;
    twitter: boolean;
    meta: boolean;
    resend: boolean;
    google_business: boolean;
  } | null>(null);

  useEffect(() => {
    const base = process.env.NEXT_PUBLIC_API_URL ?? "";
    fetch(`${base}/health/integrations`, { cache: "no-store" })
      .then((r) => r.json())
      .then(setIntegrationConfig)
      .catch(() => {}); // fail silently — buttons stay enabled if health check fails
  }, []);

  useEffect(() => {
    api
      .get<{ data: { editCount: number; profile: BrandVoiceProfile | null } }>("/settings/brand-voice")
      .then((res) => {
        setVoiceEditCount(res.data.editCount);
        setVoiceProfile(res.data.profile);
      })
      .catch(() => {}); // non-critical — section renders empty if it fails
  }, []);

  const canEdit = currentUserRole === "owner" || currentUserRole === "admin";
  const isOwner = currentUserRole === "owner";

  async function handleSaveOrg() {
    setSaving(true);
    setSaved(false);
    try {
      const payload: Record<string, string | undefined> = {
        name: orgForm.name,
        website: orgForm.website || undefined,
        logoUrl: orgForm.logoUrl || undefined,
        brandPrimaryColor: orgForm.brandPrimaryColor || undefined,
        brandSecondaryColor: orgForm.brandSecondaryColor || undefined,
        fontPreference: orgForm.fontPreference || undefined,
        logoPosition: orgForm.logoPosition || undefined,
        inspirationImageUrl: orgForm.inspirationImageUrl || undefined,
        timezone: orgForm.timezone || undefined,
      };
      const res = await api.patch<{ data: OrgData }>("/settings/org", payload);
      setOrg(res.data);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err: any) {
      toast.error(err.message ?? "Failed to save settings");
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveAutoPublish() {
    setSavingAutoPublish(true);
    try {
      await api.patch("/settings/org", {
        autoPublishEnabled,
        autoPublishThreshold,
      });
    } catch (err: any) {
      toast.error(err.message ?? "Failed to save auto-publish settings");
    } finally {
      setSavingAutoPublish(false);
    }
  }

  async function handleSaveUtm() {
    setSavingUtm(true);
    try {
      await api.patch("/settings/org", { autoUtmEnabled });
    } catch (err: any) {
      toast.error(err.message ?? "Failed to save UTM settings");
    } finally {
      setSavingUtm(false);
    }
  }

  async function handleSaveEvergreen() {
    setSavingEvergreen(true);
    try {
      await api.patch("/settings/org", {
        evergreenEnabled,
        evergreenMinAgeDays,
        evergreenMinEngagementMultiplier,
        evergreenMaxRecycles,
      });
      toast.success("Evergreen settings saved");
    } catch (err: any) {
      toast.error(err.message ?? "Failed to save evergreen settings");
    } finally {
      setSavingEvergreen(false);
    }
  }

  async function handleSaveReportSettings() {
    setSavingReport(true);
    setSavedReport(false);
    try {
      const payload: Record<string, unknown> = {
        reportAccentColor: reportAccentColor || "",
        reportFooterText: reportFooterText || "",
        reportSections,
        reportLogoUrl: reportLogoUrl || "",
      };
      const res = await api.patch<{ data: OrgData }>("/settings/org", payload);
      setOrg(res.data);
      setSavedReport(true);
      setTimeout(() => setSavedReport(false), 3000);
      toast.success("Report settings saved");
    } catch (err: any) {
      toast.error(err.message ?? "Failed to save report settings");
    } finally {
      setSavingReport(false);
    }
  }

  async function handleReportLogoUpload(file: File) {
    if (!file.type.startsWith("image/")) {
      toast.error("Please upload an image file");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      toast.error("Logo must be under 2 MB");
      return;
    }
    setReportLogoUploading(true);
    try {
      const formData = new FormData();
      formData.append("logo", file);
      const res = await api.postForm<{ data: { logoUrl: string } }>("/organizations/logo", formData);
      setReportLogoUrl(res.data.logoUrl);
    } catch (err: any) {
      toast.error(err.message ?? "Upload failed");
    } finally {
      setReportLogoUploading(false);
    }
  }

  async function handleRemoveMember(userId: string) {
    if (!confirm("Remove this member from your organization?")) return;
    setRemovingMember(userId);
    try {
      await api.delete(`/settings/members/${userId}`);
      setMembers((prev) => prev.filter((m) => m.id !== userId));
    } catch (err: any) {
      toast.error(err.message ?? "Failed to remove member");
    } finally {
      setRemovingMember(null);
    }
  }

  async function loadInvitations() {
    if (invitationsLoaded) return;
    try {
      const res = await api.get<{ data: Invitation[] }>("/settings/members/invitations");
      setInvitations(res.data ?? []);
    } catch {
      // Non-critical — silently fail
    } finally {
      setInvitationsLoaded(true);
    }
  }

  async function handleSendInvite(e: React.FormEvent) {
    e.preventDefault();
    setInviting(true);
    setInviteError("");
    setInviteSuccess("");
    try {
      const res = await api.post<{ data: Invitation }>("/settings/members/invite", {
        email: inviteEmail,
        role: inviteRole,
      });
      setInviteEmail("");
      setInviteSuccess(`Invitation sent to ${res.data.email}`);
      setInvitations((prev) => [res.data, ...prev]);
    } catch (err: any) {
      setInviteError(err.message ?? "Failed to send invitation");
    } finally {
      setInviting(false);
    }
  }

  async function handleResendInvite(inviteId: string) {
    setResendingInvite(inviteId);
    try {
      await api.post(`/settings/members/invitations/${inviteId}/resend`, {});
    } catch (err: any) {
      toast.error(err.message ?? "Failed to resend invitation");
    } finally {
      setResendingInvite(null);
    }
  }

  async function handleRevokeInvite(inviteId: string) {
    if (!confirm("Revoke this invitation?")) return;
    try {
      await api.delete(`/settings/members/invitations/${inviteId}`);
      setInvitations((prev) => prev.filter((inv) => inv.id !== inviteId));
    } catch (err: any) {
      toast.error(err.message ?? "Failed to revoke invitation");
    }
  }

  function handleCopyInviteLink(inviteId: string, link: string) {
    navigator.clipboard.writeText(link).then(() => {
      setCopiedInvite(inviteId);
      setTimeout(() => setCopiedInvite(null), 2000);
    });
  }

  async function handleValidate(integrationId: string) {
    setValidating(integrationId);
    try {
      const res = await api.post<{
        data: { id: string; channel: string; valid: boolean; errorMessage?: string; checkedAt: string };
      }>(`/settings/integrations/${integrationId}/validate`, {});
      setValidationResults((prev) => ({
        ...prev,
        [integrationId]: {
          valid: res.data.valid,
          errorMessage: res.data.errorMessage,
          checkedAt: res.data.checkedAt,
        },
      }));
      if (!res.data.valid) {
        setIntegrations((prev) =>
          prev.map((i) => (i.id === integrationId ? { ...i, isActive: false } : i)),
        );
      }
    } catch (err: any) {
      toast.error(err.message ?? "Validation failed");
    } finally {
      setValidating(null);
    }
  }

  async function handleDisconnect(integrationId: string, channel: string) {
    if (!confirm(`Disconnect ${channel} integration?`)) return;
    setDisconnecting(integrationId);
    try {
      await api.delete(`/settings/integrations/${integrationId}`);
      setIntegrations((prev) =>
        prev.map((i) => (i.id === integrationId ? { ...i, isActive: false } : i)),
      );
    } catch (err: any) {
      toast.error(err.message ?? "Failed to disconnect integration");
    } finally {
      setDisconnecting(null);
    }
  }

  async function handleConnectSms() {
    if (!twilioAccountSid.trim() || !twilioAuthToken.trim() || !twilioFromPhone.trim()) {
      toast.error("All three Twilio fields are required.");
      return;
    }
    setSavingTwilio(true);
    try {
      await api.post("/integrations/sms/connect", {
        accountSid: twilioAccountSid.trim(),
        authToken: twilioAuthToken.trim(),
        fromPhone: twilioFromPhone.trim(),
      });
      toast.success("SMS / Twilio connected successfully.");
      setTwilioAccountSid("");
      setTwilioAuthToken("");
      setTwilioFromPhone("");
      // Refresh integrations list
      const res = await api.get<{ data: Integration[] }>("/settings/integrations");
      setIntegrations(res.data);
    } catch (err: any) {
      toast.error(err.message ?? "Failed to connect SMS / Twilio");
    } finally {
      setSavingTwilio(false);
    }
  }

  function handleEditPersona(persona: Persona) {
    setPersonaForm({
      name: persona.name,
      demographics: persona.demographics ?? "",
      psychographics: persona.psychographics ?? "",
      painPoints: persona.painPoints ?? "",
      preferredChannels: persona.preferredChannels ?? [],
    });
    setEditingPersonaId(persona.id);
    setShowPersonaForm(true);
  }

  function handleCancelPersonaForm() {
    setPersonaForm(EMPTY_PERSONA_FORM);
    setEditingPersonaId(null);
    setShowPersonaForm(false);
  }

  function toggleChannel(channel: string) {
    setPersonaForm((prev) => ({
      ...prev,
      preferredChannels: prev.preferredChannels.includes(channel)
        ? prev.preferredChannels.filter((c) => c !== channel)
        : [...prev.preferredChannels, channel],
    }));
  }

  async function handleSavePersona() {
    if (!personaForm.name.trim()) return;
    setSavingPersona(true);
    try {
      if (editingPersonaId) {
        const res = await api.patch<{ data: Persona }>(`/settings/personas/${editingPersonaId}`, personaForm);
        setPersonas((prev) => prev.map((p) => (p.id === editingPersonaId ? res.data : p)));
      } else {
        const res = await api.post<{ data: Persona }>("/settings/personas", personaForm);
        setPersonas((prev) => [...prev, res.data]);
      }
      handleCancelPersonaForm();
    } catch (err: any) {
      toast.error(err.message ?? "Failed to save persona");
    } finally {
      setSavingPersona(false);
    }
  }

  async function handleDeletePersona(personaId: string) {
    if (!confirm("Delete this persona?")) return;
    setDeletingPersonaId(personaId);
    try {
      await api.delete(`/settings/personas/${personaId}`);
      setPersonas((prev) => prev.filter((p) => p.id !== personaId));
    } catch (err: any) {
      toast.error(err.message ?? "Failed to delete persona");
    } finally {
      setDeletingPersonaId(null);
    }
  }

  const handleLogoFile = useCallback(async (file: File) => {
    setLogoError(null);
    if (file.size > 2 * 1024 * 1024) {
      setLogoError("File must be under 2 MB");
      return;
    }
    const allowed = ["image/png", "image/jpeg", "image/webp"];
    if (!allowed.includes(file.type)) {
      setLogoError("Only PNG, JPEG, and WebP are allowed");
      return;
    }
    setLogoUploading(true);
    try {
      const formData = new FormData();
      formData.append("logo", file);
      const response = await fetch("/api/organizations/logo", {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error((err as any).error ?? `Upload failed: ${response.status}`);
      }
      const { data } = (await response.json()) as { data: { logoUrl: string } };
      setOrgForm((f) => ({ ...f, logoUrl: data.logoUrl }));
      setOrg((o) => ({ ...o, logoUrl: data.logoUrl }));
    } catch (err: any) {
      setLogoError(err.message ?? "Upload failed");
    } finally {
      setLogoUploading(false);
    }
  }, []);

  async function handleRegenVoice() {
    setVoiceRegenerating(true);
    try {
      const res = await api.post<{ data: { profile: BrandVoiceProfile } }>("/settings/brand-voice/regenerate", {});
      setVoiceProfile(res.data.profile);
      toast.success("Voice profile regenerated");
    } catch (err: any) {
      toast.error(err.message ?? "Failed to regenerate voice profile");
    } finally {
      setVoiceRegenerating(false);
    }
  }

  async function handleRemoveLogo() {
    setLogoError(null);
    try {
      const res = await api.patch<{ data: OrgData }>("/settings/org", { logoUrl: "" });
      setOrg(res.data);
      setOrgForm((f) => ({ ...f, logoUrl: "" }));
    } catch (err: any) {
      setLogoError(err.message ?? "Failed to remove logo");
    }
  }

  return (
    <div className="space-y-8 max-w-2xl">
      {/* ── Organization Settings ── */}
      <section>
        <div className="mb-4 flex items-center gap-2">
          <Building2 className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-base font-semibold">Organization</h2>
          <Badge variant="outline" className={`ml-auto text-xs ${PLAN_COLORS[org.plan] ?? ""}`}>
            {org.plan} plan
          </Badge>
        </div>

        <div className="rounded-lg border border-border bg-card p-4 space-y-4">
          <div>
            <Label>Organization Name</Label>
            <Input
              className="mt-1"
              value={orgForm.name}
              onChange={(e) => setOrgForm((f) => ({ ...f, name: e.target.value }))}
              disabled={!canEdit}
              placeholder="Your organization name"
            />
          </div>

          <div>
            <Label>Website</Label>
            <Input
              className="mt-1"
              value={orgForm.website}
              onChange={(e) => setOrgForm((f) => ({ ...f, website: e.target.value }))}
              disabled={!canEdit}
              placeholder="https://example.com"
              type="url"
            />
          </div>

          <div>
            <Label>Timezone</Label>
            <p className="text-xs text-muted-foreground mt-0.5 mb-1.5">
              All scheduled posts will be timed relative to this timezone.
            </p>
            <select
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50"
              value={orgForm.timezone}
              onChange={(e) => setOrgForm((f) => ({ ...f, timezone: e.target.value }))}
              disabled={!canEdit}
            >
              {TIMEZONES.map((tz) => (
                <option key={tz.value} value={tz.value}>
                  {tz.label}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2 pt-1">
            <p className="text-xs text-muted-foreground">Slug: <code className="font-mono">{org.slug}</code></p>
            {canEdit && (
              <Button
                size="sm"
                className="ml-auto gap-1.5"
                onClick={handleSaveOrg}
                disabled={saving}
              >
                {saving ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : saved ? (
                  <CheckCircle2 className="h-3.5 w-3.5 text-orion-green" />
                ) : (
                  <Save className="h-3.5 w-3.5" />
                )}
                {saved ? "Saved!" : "Save Changes"}
              </Button>
            )}
          </div>
        </div>
      </section>

      {/* ── Brand Design ── */}
      <section>
        <div className="mb-4 flex items-center gap-2">
          <Palette className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-base font-semibold">Brand Design</h2>
        </div>

        <div className="rounded-lg border border-border bg-card p-4 space-y-4">
          {/* Logo upload */}
          <div>
            <Label>Logo</Label>
            <div className="mt-2 flex items-start gap-4">
              {/* Preview box — also the drop target */}
              <div
                className={`relative flex h-[150px] w-[150px] shrink-0 items-center justify-center rounded-lg border-2 transition-colors ${
                  logoDragOver
                    ? "border-orion-green bg-orion-green/5"
                    : "border-dashed border-border bg-muted/30"
                } ${canEdit ? "cursor-pointer" : ""}`}
                onClick={() => canEdit && logoFileInputRef.current?.click()}
                onDragOver={(e) => { e.preventDefault(); if (canEdit) setLogoDragOver(true); }}
                onDragLeave={() => setLogoDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setLogoDragOver(false);
                  if (!canEdit) return;
                  const file = e.dataTransfer.files[0];
                  if (file) handleLogoFile(file);
                }}
              >
                {logoUploading ? (
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                ) : orgForm.logoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={orgForm.logoUrl}
                    alt="Logo preview"
                    className="h-full w-full rounded-lg object-contain p-2"
                  />
                ) : (
                  <Camera className="h-8 w-8 text-muted-foreground/50" />
                )}
              </div>

              {/* Upload controls */}
              {canEdit && (
                <div className="flex flex-col gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="gap-1.5"
                    onClick={() => logoFileInputRef.current?.click()}
                    disabled={logoUploading}
                  >
                    <Upload className="h-3.5 w-3.5" />
                    {orgForm.logoUrl ? "Replace logo" : "Upload logo"}
                  </Button>
                  {orgForm.logoUrl && (
                    <button
                      type="button"
                      onClick={handleRemoveLogo}
                      className="text-left text-xs text-muted-foreground underline-offset-2 hover:text-destructive hover:underline"
                    >
                      Remove logo
                    </button>
                  )}
                  <p className="text-xs text-muted-foreground">PNG, JPG, WebP · max 2 MB</p>
                  <p className="text-xs text-muted-foreground">Drag &amp; drop onto the preview</p>
                </div>
              )}
            </div>
            {logoError && (
              <p className="mt-1.5 text-xs text-destructive">{logoError}</p>
            )}
            {/* Hidden file input */}
            <input
              ref={logoFileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleLogoFile(file);
                e.target.value = "";
              }}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Primary Color</Label>
              <div className="mt-1 flex items-center gap-2">
                <input
                  type="color"
                  value={orgForm.brandPrimaryColor}
                  onChange={(e) => setOrgForm((f) => ({ ...f, brandPrimaryColor: e.target.value }))}
                  disabled={!canEdit}
                  className="h-9 w-12 cursor-pointer rounded border border-border bg-transparent p-0.5"
                />
                <Input
                  value={orgForm.brandPrimaryColor}
                  onChange={(e) => setOrgForm((f) => ({ ...f, brandPrimaryColor: e.target.value }))}
                  disabled={!canEdit}
                  placeholder="#10b981"
                  className="font-mono text-sm"
                  maxLength={7}
                />
              </div>
            </div>

            <div>
              <Label>Secondary Color</Label>
              <div className="mt-1 flex items-center gap-2">
                <input
                  type="color"
                  value={orgForm.brandSecondaryColor}
                  onChange={(e) => setOrgForm((f) => ({ ...f, brandSecondaryColor: e.target.value }))}
                  disabled={!canEdit}
                  className="h-9 w-12 cursor-pointer rounded border border-border bg-transparent p-0.5"
                />
                <Input
                  value={orgForm.brandSecondaryColor}
                  onChange={(e) => setOrgForm((f) => ({ ...f, brandSecondaryColor: e.target.value }))}
                  disabled={!canEdit}
                  placeholder="#3b82f6"
                  className="font-mono text-sm"
                  maxLength={7}
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Font Preference</Label>
              <select
                className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50"
                value={orgForm.fontPreference}
                onChange={(e) => setOrgForm((f) => ({ ...f, fontPreference: e.target.value }))}
                disabled={!canEdit}
              >
                <option value="">— Select —</option>
                {FONT_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>

            <div>
              <Label>Logo Position</Label>
              <select
                className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50"
                value={orgForm.logoPosition}
                onChange={(e) => setOrgForm((f) => ({ ...f, logoPosition: e.target.value }))}
                disabled={!canEdit}
              >
                {LOGO_POSITION_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <Label>Inspiration Image URL</Label>
            <Input
              className="mt-1"
              value={orgForm.inspirationImageUrl}
              onChange={(e) => setOrgForm((f) => ({ ...f, inspirationImageUrl: e.target.value }))}
              disabled={!canEdit}
              placeholder="https://example.com/inspiration.jpg (visual style reference)"
              type="url"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Used as a visual style reference for AI-generated content and imagery.
            </p>
          </div>

          {canEdit && (
            <div className="flex justify-end pt-1">
              <Button size="sm" className="gap-1.5" onClick={handleSaveOrg} disabled={saving}>
                {saving ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : saved ? (
                  <CheckCircle2 className="h-3.5 w-3.5 text-orion-green" />
                ) : (
                  <Save className="h-3.5 w-3.5" />
                )}
                {saved ? "Saved!" : "Save Brand Design"}
              </Button>
            </div>
          )}
        </div>
      </section>

      {/* ── Audience Personas ── */}
      <section>
        <div className="mb-4 flex items-center gap-2">
          <UserCircle2 className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-base font-semibold">Audience Personas</h2>
          <span className="ml-auto text-xs text-muted-foreground">{(personas ?? []).length}/3</span>
          {canEdit && (personas ?? []).length < 3 && !showPersonaForm && (
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5"
              onClick={() => setShowPersonaForm(true)}
            >
              <Plus className="h-3.5 w-3.5" />
              Add Persona
            </Button>
          )}
        </div>

        {/* Persona cards */}
        {(personas ?? []).length > 0 && (
          <div className="space-y-3 mb-4">
            {(personas ?? []).map((persona) => (
              <div key={persona.id} className="rounded-lg border border-border bg-card p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-sm">{persona.name}</p>
                    {persona.demographics && (
                      <p className="text-xs text-muted-foreground mt-1">
                        <span className="font-medium text-foreground/70">Demographics:</span> {persona.demographics}
                      </p>
                    )}
                    {persona.psychographics && (
                      <p className="text-xs text-muted-foreground mt-0.5">
                        <span className="font-medium text-foreground/70">Psychographics:</span> {persona.psychographics}
                      </p>
                    )}
                    {persona.painPoints && (
                      <p className="text-xs text-muted-foreground mt-0.5">
                        <span className="font-medium text-foreground/70">Pain Points:</span> {persona.painPoints}
                      </p>
                    )}
                    {persona.preferredChannels?.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {persona.preferredChannels.map((ch) => (
                          <Badge key={ch} variant="outline" className="text-xs capitalize">
                            {ch}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>
                  {canEdit && (
                    <div className="flex items-center gap-1 shrink-0">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0"
                        onClick={() => handleEditPersona(persona)}
                        title="Edit persona"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                        onClick={() => handleDeletePersona(persona.id)}
                        disabled={deletingPersonaId === persona.id}
                        title="Delete persona"
                      >
                        {deletingPersonaId === persona.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Trash2 className="h-3.5 w-3.5" />
                        )}
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Persona form */}
        {showPersonaForm && canEdit && (
          <div className="rounded-lg border border-border bg-card p-4 space-y-3">
            <p className="text-sm font-medium">{editingPersonaId ? "Edit Persona" : "New Persona"}</p>

            <div>
              <Label>Name *</Label>
              <Input
                className="mt-1"
                value={personaForm.name}
                onChange={(e) => setPersonaForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Growth-Stage Startup Founder"
              />
            </div>

            <div>
              <Label>Demographics</Label>
              <Input
                className="mt-1"
                value={personaForm.demographics}
                onChange={(e) => setPersonaForm((f) => ({ ...f, demographics: e.target.value }))}
                placeholder="e.g. Ages 28-45, B2B SaaS, Series A-B companies"
              />
            </div>

            <div>
              <Label>Psychographics</Label>
              <Input
                className="mt-1"
                value={personaForm.psychographics}
                onChange={(e) => setPersonaForm((f) => ({ ...f, psychographics: e.target.value }))}
                placeholder="e.g. Ambitious, data-driven, values speed and ROI"
              />
            </div>

            <div>
              <Label>Pain Points</Label>
              <Input
                className="mt-1"
                value={personaForm.painPoints}
                onChange={(e) => setPersonaForm((f) => ({ ...f, painPoints: e.target.value }))}
                placeholder="e.g. Too much time on manual processes, hard to scale content"
              />
            </div>

            <div>
              <Label>Preferred Channels</Label>
              <div className="mt-2 flex flex-wrap gap-2">
                {ALL_CHANNELS.map((ch) => (
                  <button
                    key={ch}
                    type="button"
                    onClick={() => toggleChannel(ch)}
                    className={`rounded-md border px-2.5 py-1 text-xs capitalize transition-colors ${
                      personaForm.preferredChannels.includes(ch)
                        ? "border-orion-green bg-orion-green/10 text-orion-green"
                        : "border-border bg-background text-muted-foreground hover:border-muted-foreground"
                    }`}
                  >
                    {ch}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-2 pt-1">
              <Button
                size="sm"
                onClick={handleSavePersona}
                disabled={savingPersona || !personaForm.name.trim()}
                className="gap-1.5"
              >
                {savingPersona ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                {editingPersonaId ? "Update Persona" : "Save Persona"}
              </Button>
              <Button size="sm" variant="ghost" onClick={handleCancelPersonaForm} disabled={savingPersona}>
                Cancel
              </Button>
            </div>
          </div>
        )}

        {(personas ?? []).length === 0 && !showPersonaForm && (
          <div className="rounded-lg border border-dashed border-border bg-card px-4 py-8 text-center">
            <UserCircle2 className="mx-auto mb-2 h-6 w-6 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">No personas defined yet.</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Add up to 3 audience personas to tailor AI-generated content and strategy.
            </p>
          </div>
        )}
      </section>

      {/* ── Team Members ── */}
      <section>
        <div className="mb-4 flex items-center gap-2">
          <Users className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-base font-semibold">Team Members</h2>
          <span className="ml-auto text-xs text-muted-foreground">{(members ?? []).length} member{(members ?? []).length !== 1 ? "s" : ""}</span>
        </div>

        {/* Active members list */}
        <div className="rounded-lg border border-border bg-card divide-y divide-border">
          {(members ?? []).length === 0 ? (
            <div className="px-4 py-6 text-center text-sm text-muted-foreground">
              No members found
            </div>
          ) : (
            (members ?? []).map((member) => (
              <div key={member.id} className="flex items-center gap-3 px-4 py-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium uppercase">
                  {member.name?.[0] ?? member.email[0]}
                </div>

                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">{member.name ?? "—"}</p>
                  <p className="text-xs text-muted-foreground truncate">{member.email}</p>
                </div>

                <Badge
                  variant="outline"
                  className={`shrink-0 text-xs ${ROLE_COLORS[member.role] ?? ""}`}
                >
                  {member.role}
                </Badge>

                {isOwner && member.id !== currentUserId && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 shrink-0 p-0 text-destructive hover:text-destructive"
                    onClick={() => handleRemoveMember(member.id)}
                    disabled={removingMember === member.id}
                    title="Remove member"
                  >
                    {removingMember === member.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="h-3.5 w-3.5" />
                    )}
                  </Button>
                )}
              </div>
            ))
          )}
        </div>

        {/* Invite form — owner/admin only */}
        {canEdit && (
          <div className="mt-4 rounded-lg border border-border bg-card p-4">
            <p className="text-sm font-medium mb-3">Invite a new member</p>
            <form onSubmit={handleSendInvite} className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <div className="flex-1 min-w-0">
                <label className="text-xs text-muted-foreground mb-1 block">Email address</label>
                <Input
                  type="email"
                  placeholder="colleague@company.com"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  required
                  className="h-8 text-sm"
                />
              </div>
              <div className="shrink-0">
                <label className="text-xs text-muted-foreground mb-1 block">Role</label>
                <select
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value as typeof inviteRole)}
                  className="h-8 rounded-md border border-input bg-background px-2 text-sm"
                >
                  <option value="viewer">Viewer</option>
                  <option value="editor">Editor</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
              <Button type="submit" size="sm" className="h-8 gap-1.5 shrink-0" disabled={inviting}>
                {inviting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                Send invite
              </Button>
            </form>
            {inviteSuccess && <p className="mt-2 text-xs text-green-500">{inviteSuccess}</p>}
            {inviteError && <p className="mt-2 text-xs text-destructive">{inviteError}</p>}
          </div>
        )}

        {/* Pending invitations — lazy loaded on expand */}
        {canEdit && (
          <div className="mt-3">
            {!invitationsLoaded ? (
              <button
                type="button"
                className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
                onClick={loadInvitations}
              >
                View pending invitations
              </button>
            ) : invitations.length === 0 ? (
              <p className="text-xs text-muted-foreground">No pending invitations.</p>
            ) : (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-2">Pending invitations ({invitations.length})</p>
                <div className="rounded-lg border border-border bg-card divide-y divide-border">
                  {invitations.map((inv) => (
                    <div key={inv.id} className="flex items-center gap-3 px-4 py-3">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted/50 border border-dashed border-border text-xs text-muted-foreground">
                        <Clock className="h-3.5 w-3.5" />
                      </div>

                      <div className="min-w-0 flex-1">
                        <p className="text-sm truncate">{inv.email}</p>
                        <p className="text-xs text-muted-foreground">
                          Expires {new Date(inv.expiresAt).toLocaleDateString()}
                        </p>
                      </div>

                      <Badge variant="outline" className="shrink-0 text-xs bg-yellow-500/10 text-yellow-400 border-yellow-500/20">
                        Invited
                      </Badge>

                      <Badge variant="outline" className={`shrink-0 text-xs ${ROLE_COLORS[inv.role] ?? ""}`}>
                        {inv.role}
                      </Badge>

                      <div className="flex items-center gap-1 shrink-0">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-xs gap-1"
                          onClick={() => handleResendInvite(inv.id)}
                          disabled={resendingInvite === inv.id}
                          title="Resend invite email"
                        >
                          {resendingInvite === inv.id ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <Send className="h-3 w-3" />
                          )}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-xs gap-1"
                          onClick={() => handleCopyInviteLink(inv.id, inv.inviteLink)}
                          title="Copy invite link"
                        >
                          {copiedInvite === inv.id ? (
                            <CheckCircle2 className="h-3 w-3 text-green-500" />
                          ) : (
                            <Copy className="h-3 w-3" />
                          )}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                          onClick={() => handleRevokeInvite(inv.id)}
                          title="Revoke invitation"
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </section>

      {/* ── Integrations ── */}
      <section>
        <div className="mb-4 flex items-center gap-2">
          <Plug className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-base font-semibold">Channel Integrations</h2>
        </div>

        {/* Connect new integration buttons */}
        {canEdit && (
          <div className="mb-3 flex flex-wrap gap-2">
            {(["linkedin", "twitter", "facebook", "email", "sms", "google_business"] as const).map((ch) => {
              const isConnected = (integrations ?? []).some((i) => i.channel === ch && i.isActive);
              if (isConnected) return null;

              const apiBase = process.env.NEXT_PUBLIC_API_URL ?? "";
              const connectUrl = (ch === "email" || ch === "sms")
                ? null
                : `${apiBase}/integrations/${ch === "facebook" ? "meta" : ch === "google_business" ? "google-business" : ch}/connect`;

              // Map channel to provider config key
              const providerKey =
                ch === "facebook"         ? "meta" :
                ch === "email"            ? "resend" :
                ch === "google_business"  ? "google_business" :
                ch as "linkedin" | "twitter";

              // SMS uses its own form below — skip the config check
              if (ch !== "sms") {
                // null config = still loading → show enabled (optimistic)
                const isConfigured = integrationConfig === null
                  ? true
                  : integrationConfig[providerKey] ?? true;

                if (!isConfigured) {
                  return (
                    <div key={ch} className="group relative">
                      <span
                        className="inline-flex cursor-not-allowed items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground/40 capitalize select-none"
                        title={`Not available — ${channelLabel(ch)} credentials not configured`}
                      >
                        {CHANNEL_ICONS[ch]}
                        Connect {channelLabel(ch)}
                      </span>
                      <span className="pointer-events-none absolute left-0 top-full mt-1.5 z-10 w-max max-w-[220px] rounded border border-border bg-popover px-2 py-1 text-xs text-muted-foreground shadow-md opacity-0 group-hover:opacity-100 transition-opacity">
                        Not available — provider credentials not configured
                      </span>
                    </div>
                  );
                }
              }

              return (
                <a
                  key={ch}
                  href={connectUrl ?? "#"}
                  onClick={
                    ch === "email"
                      ? (e) => { e.preventDefault(); toast.info("Info", "Enter your Resend API key in the email settings below."); }
                      : ch === "sms"
                      ? (e) => { e.preventDefault(); document.getElementById("sms-twilio-form")?.scrollIntoView({ behavior: "smooth" }); }
                      : undefined
                  }
                  className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground hover:border-muted-foreground hover:text-foreground transition-colors capitalize"
                >
                  {CHANNEL_ICONS[ch]}
                  Connect {ch === "sms" ? "SMS" : channelLabel(ch)}
                </a>
              );
            })}
          </div>
        )}

        {(integrations ?? []).length === 0 ? (
          <div className="rounded-lg border border-dashed border-border bg-card px-4 py-8 text-center">
            <Plug className="mx-auto mb-2 h-6 w-6 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">No channel integrations connected yet.</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Connect LinkedIn, Twitter, Google Business, or email platforms to enable direct publishing.
            </p>
          </div>
        ) : (
          <div className="rounded-lg border border-border bg-card divide-y divide-border">
            {(integrations ?? []).map((integration) => (
              <div key={integration.id} className="flex items-center gap-3 px-4 py-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border bg-muted text-muted-foreground">
                  {CHANNEL_ICONS[integration.channel] ?? <Plug className="h-4 w-4" />}
                </div>

                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium capitalize">{channelLabel(integration.channel)}</p>
                  {integration.accountName && (
                    <p className="text-xs text-muted-foreground">{integration.accountName}</p>
                  )}
                  {integration.tokenExpiresAt && (
                    <p className="text-xs text-muted-foreground">
                      Expires: {new Date(integration.tokenExpiresAt).toLocaleDateString()}
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  {integration.isActive ? (
                    <span className="flex items-center gap-1 text-xs text-orion-green">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      Active
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <XCircle className="h-3.5 w-3.5" />
                      Disconnected
                    </span>
                  )}

                  {integration.isActive && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => handleValidate(integration.id)}
                      disabled={validating === integration.id}
                      title="Test token validity"
                    >
                      {validating === integration.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        "Validate"
                      )}
                    </Button>
                  )}

                  {validationResults[integration.id] && (
                    <span
                      className={`flex items-center gap-1 text-xs ${validationResults[integration.id].valid ? "text-green-600" : "text-red-500"}`}
                      title={validationResults[integration.id].errorMessage}
                    >
                      {validationResults[integration.id].valid ? (
                        <CheckCircle2 className="h-3 w-3" />
                      ) : (
                        <XCircle className="h-3 w-3" />
                      )}
                      {validationResults[integration.id].valid ? "Valid" : "Invalid"}
                    </span>
                  )}

                  {canEdit && integration.isActive && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs text-destructive hover:text-destructive"
                      onClick={() => handleDisconnect(integration.id, integration.channel)}
                      disabled={disconnecting === integration.id}
                    >
                      {disconnecting === integration.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        "Disconnect"
                      )}
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── SMS / Twilio ── */}
      {canEdit && (integrations ?? []).every((i) => i.channel !== "sms" || !i.isActive) && (
        <section id="sms-twilio-form">
          <div className="mb-4 flex items-center gap-2">
            <MessageSquare className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-base font-semibold">SMS / Twilio</h2>
          </div>

          <div className="rounded-lg border border-border bg-card p-4 space-y-4">
            <p className="text-xs text-muted-foreground">
              Connect a Twilio account to enable SMS publishing. Your Auth Token is stored encrypted.
            </p>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="twilio-account-sid" className="text-xs">Account SID</Label>
                <Input
                  id="twilio-account-sid"
                  placeholder="ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                  value={twilioAccountSid}
                  onChange={(e) => setTwilioAccountSid(e.target.value)}
                  className="h-8 text-xs font-mono"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="twilio-auth-token" className="text-xs">Auth Token</Label>
                <Input
                  id="twilio-auth-token"
                  type="password"
                  placeholder="••••••••••••••••••••••••••••••••"
                  value={twilioAuthToken}
                  onChange={(e) => setTwilioAuthToken(e.target.value)}
                  className="h-8 text-xs font-mono"
                />
              </div>

              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="twilio-from-phone" className="text-xs">From Phone Number (E.164)</Label>
                <Input
                  id="twilio-from-phone"
                  placeholder="+15551234567"
                  value={twilioFromPhone}
                  onChange={(e) => setTwilioFromPhone(e.target.value)}
                  className="h-8 text-xs font-mono"
                />
              </div>
            </div>

            <Button
              size="sm"
              onClick={handleConnectSms}
              disabled={savingTwilio || !twilioAccountSid || !twilioAuthToken || !twilioFromPhone}
              className="gap-1.5"
            >
              {savingTwilio ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <MessageSquare className="h-3.5 w-3.5" />}
              Connect SMS / Twilio
            </Button>
          </div>
        </section>
      )}

      {/* ── Auto-Publish ── */}
      {canEdit && (
        <section>
          <div className="mb-4 flex items-center gap-2">
            <Zap className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-base font-semibold">Auto-Publish</h2>
          </div>

          <div className="rounded-lg border border-border bg-card p-4 space-y-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium">Enable auto-publish</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Automatically publish approved assets that meet the quality threshold.
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={autoPublishEnabled}
                onClick={() => setAutoPublishEnabled((v) => !v)}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none ${
                  autoPublishEnabled ? "bg-orion-green" : "bg-muted"
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition-transform ${
                    autoPublishEnabled ? "translate-x-5" : "translate-x-0"
                  }`}
                />
              </button>
            </div>

            {autoPublishEnabled && (
              <div>
                <label className="text-sm font-medium block mb-1">
                  Quality threshold: <span className="text-orion-green">{autoPublishThreshold}</span>/100
                </label>
                <input
                  type="range"
                  min={50}
                  max={100}
                  step={5}
                  value={autoPublishThreshold}
                  onChange={(e) => setAutoPublishThreshold(Number(e.target.value))}
                  className="w-full accent-orion-green"
                />
                <div className="flex justify-between text-xs text-muted-foreground mt-1">
                  <span>50 (permissive)</span>
                  <span>100 (only perfect)</span>
                </div>
              </div>
            )}

            <Button
              size="sm"
              onClick={handleSaveAutoPublish}
              disabled={savingAutoPublish}
              className="gap-1.5"
            >
              {savingAutoPublish ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              Save Auto-Publish Settings
            </Button>
          </div>
        </section>
      )}

      {/* ── UTM Attribution ── */}
      {canEdit && (
        <section>
          <div className="mb-4 flex items-center gap-2">
            <Link2 className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-base font-semibold">UTM Attribution</h2>
          </div>

          <div className="rounded-lg border border-border bg-card p-4 space-y-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium">Auto-append UTM parameters to links</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Automatically tags URLs in scheduled posts with utm_source, utm_medium, and utm_campaign for attribution tracking.
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={autoUtmEnabled}
                onClick={() => setAutoUtmEnabled((v) => !v)}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none ${
                  autoUtmEnabled ? "bg-orion-green" : "bg-muted"
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition-transform ${
                    autoUtmEnabled ? "translate-x-5" : "translate-x-0"
                  }`}
                />
              </button>
            </div>

            {autoUtmEnabled && (
              <div className="rounded-md bg-muted/40 border border-border p-3 space-y-1 text-xs text-muted-foreground font-mono">
                <p>utm_source=<span className="text-foreground">[channel]</span></p>
                <p>utm_medium=<span className="text-foreground">social | email | blog</span></p>
                <p>utm_campaign=<span className="text-foreground">[campaign-name-slug]</span></p>
                <p>utm_content=<span className="text-foreground">a | b</span> <span className="font-sans not-italic">(A/B only)</span></p>
              </div>
            )}

            <Button
              size="sm"
              onClick={handleSaveUtm}
              disabled={savingUtm}
              className="gap-1.5"
            >
              {savingUtm ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              Save UTM Settings
            </Button>
          </div>
        </section>
      )}

      {/* ── Autopilot Mode ── */}
      {canEdit && (
        <section>
          <div className="mb-4 flex items-center gap-2">
            <Zap className="h-4 w-4 text-orion-green" />
            <h2 className="text-base font-semibold">Autopilot Mode</h2>
          </div>

          <div className="rounded-lg border border-orion-green/20 bg-orion-green/5 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Weekly Auto-Campaign</p>
                <p className="text-xs text-muted-foreground">
                  When enabled, STELOS automatically generates a new marketing campaign every Monday using your connected channels.
                </p>
              </div>
            </div>

            <div className="space-y-2 text-xs text-muted-foreground">
              <p className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-orion-green shrink-0" />
                Creates a brand awareness goal with AI-selected strategy
              </p>
              <p className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-orion-green shrink-0" />
                Generates content for all connected channels
              </p>
              <p className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-orion-green shrink-0" />
                {autoPublishEnabled
                  ? "Content auto-publishes when quality score meets threshold"
                  : "Content goes to Review queue for manual approval"}
              </p>
            </div>

            <p className="text-[11px] text-muted-foreground border-t border-border/50 pt-3">
              Autopilot uses the Auto-Publish toggle above. Enable Auto-Publish to go fully hands-free, or leave it off to review generated content before publishing.
            </p>
          </div>
        </section>
      )}

      {/* ── Evergreen Recycling ── */}
      {canEdit && (
        <section>
          <div className="mb-4 flex items-center gap-2">
            <RefreshCw className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-base font-semibold">Evergreen Recycling</h2>
          </div>

          <div className="rounded-lg border border-border bg-card p-4 space-y-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium">Enable Evergreen Recycling</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Automatically identifies top-performing content and refreshes it with a new hook every week. Recycled posts are auto-scheduled.
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={evergreenEnabled}
                onClick={() => setEvergreenEnabled((v) => !v)}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none ${
                  evergreenEnabled ? "bg-orion-green" : "bg-muted"
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition-transform ${
                    evergreenEnabled ? "translate-x-5" : "translate-x-0"
                  }`}
                />
              </button>
            </div>

            {evergreenEnabled && (
              <div className="space-y-4 border-t border-border pt-4">
                <div>
                  <label className="text-sm font-medium block mb-1">
                    Minimum age before recycling: <span className="text-orion-green">{evergreenMinAgeDays} days</span>
                  </label>
                  <input
                    type="range"
                    min={7}
                    max={180}
                    step={7}
                    value={evergreenMinAgeDays}
                    onChange={(e) => setEvergreenMinAgeDays(Number(e.target.value))}
                    className="w-full accent-orion-green"
                  />
                  <div className="flex justify-between text-xs text-muted-foreground mt-1">
                    <span>7 days</span>
                    <span>180 days</span>
                  </div>
                </div>

                <div>
                  <label className="text-sm font-medium block mb-1">
                    Minimum engagement multiplier: <span className="text-orion-green">{evergreenMinEngagementMultiplier.toFixed(1)}x avg</span>
                  </label>
                  <input
                    type="range"
                    min={1.0}
                    max={5.0}
                    step={0.1}
                    value={evergreenMinEngagementMultiplier}
                    onChange={(e) => setEvergreenMinEngagementMultiplier(Number(e.target.value))}
                    className="w-full accent-orion-green"
                  />
                  <div className="flex justify-between text-xs text-muted-foreground mt-1">
                    <span>1.0x (any above avg)</span>
                    <span>5.0x (top performers)</span>
                  </div>
                </div>

                <div>
                  <label className="text-sm font-medium block mb-1">
                    Maximum recycles per post: <span className="text-orion-green">{evergreenMaxRecycles}</span>
                  </label>
                  <input
                    type="range"
                    min={1}
                    max={10}
                    step={1}
                    value={evergreenMaxRecycles}
                    onChange={(e) => setEvergreenMaxRecycles(Number(e.target.value))}
                    className="w-full accent-orion-green"
                  />
                  <div className="flex justify-between text-xs text-muted-foreground mt-1">
                    <span>1 (once only)</span>
                    <span>10 (keep recycling)</span>
                  </div>
                </div>

                <div className="rounded-md bg-muted/40 border border-border p-3 space-y-1 text-xs text-muted-foreground">
                  <p className="flex items-center gap-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-orion-green shrink-0" />
                    Runs every Monday at 09:00 UTC
                  </p>
                  <p className="flex items-center gap-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-orion-green shrink-0" />
                    Posts recycled at most once every 60 days
                  </p>
                  <p className="flex items-center gap-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-orion-green shrink-0" />
                    Recycled variants are auto-scheduled at optimal times
                  </p>
                </div>
              </div>
            )}

            <Button
              size="sm"
              onClick={handleSaveEvergreen}
              disabled={savingEvergreen}
              className="gap-1.5"
            >
              {savingEvergreen ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              Save Evergreen Settings
            </Button>
          </div>
        </section>
      )}

      {/* ── Brand Voice ── */}
      <section>
        <div className="mb-4 flex items-center gap-2">
          <Mic className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-base font-semibold flex items-center gap-1">
            Brand Voice
            <TooltipHelp text="Learned from your edits — the more you refine content, the better Orion writes in your voice." side="right" />
          </h2>
          {voiceEditCount !== null && (
            <span className="ml-auto text-xs text-muted-foreground">
              {voiceEditCount} edit{voiceEditCount !== 1 ? "s" : ""} captured
            </span>
          )}
        </div>

        <div className="rounded-lg border border-border bg-card p-4 space-y-4">
          {voiceEditCount === null ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : voiceEditCount < 10 ? (
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">
                Brand voice learning is active. Edit AI-generated copy in the Review flow to teach STELOS your style.
              </p>
              <div className="flex items-center gap-2 mt-2">
                <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full rounded-full bg-orion-green transition-all"
                    style={{ width: `${Math.round((voiceEditCount / 10) * 100)}%` }}
                  />
                </div>
                <span className="text-xs text-muted-foreground tabular-nums">{voiceEditCount}/10</span>
              </div>
            </div>
          ) : voiceProfile ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5 flex items-center gap-1">
                    Tone
                    <TooltipHelp text="Controls the personality of AI-generated content." side="right" />
                  </p>
                  <p className="font-medium leading-snug">{voiceProfile.tone}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">Formality</p>
                  <p className="font-medium capitalize">{voiceProfile.formality}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">Sentence length</p>
                  <p className="font-medium capitalize">{voiceProfile.sentenceLengthPreference}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">Emoji usage</p>
                  <p className="font-medium capitalize">{voiceProfile.emojiUsage}</p>
                </div>
              </div>

              {voiceProfile.ctaStyle && (
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">CTA style</p>
                  <p className="text-sm">{voiceProfile.ctaStyle}</p>
                </div>
              )}

              {voiceProfile.vocabulary.length > 0 && (
                <div>
                  <p className="text-xs text-muted-foreground mb-1.5">Preferred vocabulary</p>
                  <div className="flex flex-wrap gap-1.5">
                    {voiceProfile.vocabulary.map((word) => (
                      <span
                        key={word}
                        className="inline-flex items-center rounded-full bg-orion-green/10 text-orion-green border border-orion-green/20 px-2.5 py-0.5 text-xs font-medium"
                      >
                        {word}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {voiceProfile.bannedPhrases.length > 0 && (
                <div>
                  <p className="text-xs text-muted-foreground mb-1.5">Avoided phrases</p>
                  <div className="flex flex-wrap gap-1.5">
                    {voiceProfile.bannedPhrases.map((phrase) => (
                      <span
                        key={phrase}
                        className="inline-flex items-center rounded-full bg-red-500/10 text-red-400 border border-red-500/20 px-2.5 py-0.5 text-xs font-medium"
                      >
                        {phrase}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {voiceProfile.exampleGoodCopy && (
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">Example (learned)</p>
                  <blockquote className="border-l-2 border-orion-green/40 pl-3 text-sm italic text-muted-foreground">
                    {voiceProfile.exampleGoodCopy}
                  </blockquote>
                </div>
              )}

              {voiceProfile.lastUpdated && (
                <p className="text-xs text-muted-foreground">
                  Last updated {new Date(voiceProfile.lastUpdated).toLocaleDateString()}
                </p>
              )}

              {canEdit && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleRegenVoice}
                  disabled={voiceRegenerating}
                  className="gap-1.5"
                >
                  {voiceRegenerating ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <RefreshCw className="h-3.5 w-3.5" />
                  )}
                  Regenerate Voice Profile
                </Button>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Generating voice profile…</p>
          )}
        </div>
      </section>

      {/* ── Report Settings ── */}
      {canEdit && (
        <section>
          <div className="flex items-center gap-2 mb-3">
            <FileText className="h-5 w-5 text-muted-foreground" />
            <h2 className="text-base font-semibold">Report Settings</h2>
          </div>
          <p className="text-sm text-muted-foreground mb-4">
            Customize the look and content of your client-facing PDF reports.
          </p>
          <div className="space-y-4 rounded-lg border border-border bg-card p-4">
            {/* Report Logo */}
            <div>
              <Label className="text-sm">Report Logo</Label>
              <p className="text-xs text-muted-foreground mb-2">
                Optional logo for reports (may differ from your brand logo). Falls back to your org logo.
              </p>
              <div className="flex items-center gap-3">
                {reportLogoUrl ? (
                  <div className="relative h-12 w-12 rounded border border-border overflow-hidden bg-muted">
                    <img src={reportLogoUrl} alt="Report logo" className="h-full w-full object-contain" />
                  </div>
                ) : (
                  <div className="h-12 w-12 rounded border border-dashed border-border bg-muted flex items-center justify-center">
                    <Upload className="h-4 w-4 text-muted-foreground" />
                  </div>
                )}
                <div className="flex gap-2">
                  <input
                    ref={reportLogoInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleReportLogoUpload(file);
                    }}
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => reportLogoInputRef.current?.click()}
                    disabled={reportLogoUploading}
                  >
                    {reportLogoUploading ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Upload className="h-3.5 w-3.5 mr-1" />}
                    Upload
                  </Button>
                  {reportLogoUrl && (
                    <Button variant="ghost" size="sm" onClick={() => setReportLogoUrl("")}>
                      Remove
                    </Button>
                  )}
                </div>
              </div>
            </div>

            {/* Report Accent Color */}
            <div>
              <Label className="text-sm">Report Accent Color</Label>
              <p className="text-xs text-muted-foreground mb-1.5">
                Accent color used for headings and highlights. Falls back to your brand primary color.
              </p>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={reportAccentColor || orgForm.brandPrimaryColor || "#16a34a"}
                  onChange={(e) => setReportAccentColor(e.target.value)}
                  className="h-9 w-9 rounded border border-border cursor-pointer bg-transparent"
                />
                <Input
                  value={reportAccentColor}
                  onChange={(e) => setReportAccentColor(e.target.value)}
                  placeholder={orgForm.brandPrimaryColor || "#16a34a"}
                  className="w-32 font-mono text-sm"
                />
                {reportAccentColor && (
                  <Button variant="ghost" size="sm" onClick={() => setReportAccentColor("")}>
                    Reset
                  </Button>
                )}
              </div>
            </div>

            {/* Sections to Include */}
            <div>
              <Label className="text-sm">Sections to Include</Label>
              <p className="text-xs text-muted-foreground mb-2">
                Choose which sections appear in exported reports.
              </p>
              <div className="space-y-1.5">
                {ALL_REPORT_SECTIONS.map((section) => (
                  <label key={section.value} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={reportSections.includes(section.value)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setReportSections((prev) => [...prev, section.value]);
                        } else {
                          setReportSections((prev) => prev.filter((s) => s !== section.value));
                        }
                      }}
                      className="rounded border-border"
                    />
                    <span className="text-sm">{section.label}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Footer Text */}
            <div>
              <Label className="text-sm">Custom Footer Text</Label>
              <p className="text-xs text-muted-foreground mb-1.5">
                Appears at the bottom of each report (e.g., &quot;Prepared by Acme Agency&quot;).
              </p>
              <Input
                value={reportFooterText}
                onChange={(e) => setReportFooterText(e.target.value)}
                placeholder="Prepared by {agency name}"
                maxLength={500}
              />
            </div>

            {/* Save */}
            <div className="flex items-center gap-2 pt-1">
              <Button
                onClick={handleSaveReportSettings}
                disabled={savingReport}
                size="sm"
                className="gap-1.5"
              >
                {savingReport ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : savedReport ? (
                  <CheckCircle2 className="h-3.5 w-3.5" />
                ) : (
                  <Save className="h-3.5 w-3.5" />
                )}
                {savedReport ? "Saved" : "Save Report Settings"}
              </Button>
            </div>
          </div>
        </section>
      )}

      {/* ── Danger Zone ── */}
      {isOwner && (
        <section>
          <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-4">
            <h3 className="text-sm font-semibold text-red-400">Danger Zone</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Destructive actions cannot be undone. Contact support to delete your organization.
            </p>
          </div>
        </section>
      )}
    </div>
  );
}
