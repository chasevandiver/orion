"use client";

import { useState } from "react";
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
} from "lucide-react";

interface OrgData {
  id: string;
  name: string;
  slug: string;
  website?: string;
  logoUrl?: string;
  plan: string;
  createdAt: string;
  brandPrimaryColor?: string;
  brandSecondaryColor?: string;
  fontPreference?: string;
  logoPosition?: string;
  inspirationImageUrl?: string;
}

interface Member {
  id: string;
  email: string;
  name?: string;
  image?: string;
  role: string;
  createdAt: string;
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
  createdAt: string;
}

interface SettingsPanelProps {
  org: OrgData;
  members: Member[];
  integrations: Integration[];
  personas: Persona[];
  currentUserId: string;
  currentUserRole: string;
}

const CHANNEL_ICONS: Record<string, React.ReactNode> = {
  linkedin: <Linkedin className="h-4 w-4" />,
  twitter: <Twitter className="h-4 w-4" />,
  instagram: <Instagram className="h-4 w-4" />,
  facebook: <Facebook className="h-4 w-4" />,
  email: <Mail className="h-4 w-4" />,
  blog: <FileText className="h-4 w-4" />,
  tiktok: <Zap className="h-4 w-4" />,
};

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

const ALL_CHANNELS = ["linkedin", "twitter", "instagram", "facebook", "tiktok", "email", "blog", "website"];

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
  const [org, setOrg] = useState(initialOrg);
  const [members, setMembers] = useState(initialMembers);
  const [integrations, setIntegrations] = useState(initialIntegrations);
  const [personas, setPersonas] = useState(initialPersonas);

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
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Integrations state
  const [removingMember, setRemovingMember] = useState<string | null>(null);
  const [disconnecting, setDisconnecting] = useState<string | null>(null);
  const [validating, setValidating] = useState<string | null>(null);
  const [validationResults, setValidationResults] = useState<
    Record<string, { valid: boolean; errorMessage?: string; checkedAt: string }>
  >({});

  // Personas state
  const [personaForm, setPersonaForm] = useState(EMPTY_PERSONA_FORM);
  const [editingPersonaId, setEditingPersonaId] = useState<string | null>(null);
  const [showPersonaForm, setShowPersonaForm] = useState(false);
  const [savingPersona, setSavingPersona] = useState(false);
  const [deletingPersonaId, setDeletingPersonaId] = useState<string | null>(null);

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
      };
      const res = await api.patch<{ data: OrgData }>("/settings/org", payload);
      setOrg(res.data);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err: any) {
      alert(err.message ?? "Failed to save settings");
    } finally {
      setSaving(false);
    }
  }

  async function handleRemoveMember(userId: string) {
    if (!confirm("Remove this member from your organization?")) return;
    setRemovingMember(userId);
    try {
      await api.delete(`/settings/members/${userId}`);
      setMembers((prev) => prev.filter((m) => m.id !== userId));
    } catch (err: any) {
      alert(err.message ?? "Failed to remove member");
    } finally {
      setRemovingMember(null);
    }
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
      alert(err.message ?? "Validation failed");
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
      alert(err.message ?? "Failed to disconnect integration");
    } finally {
      setDisconnecting(null);
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
      alert(err.message ?? "Failed to save persona");
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
      alert(err.message ?? "Failed to delete persona");
    } finally {
      setDeletingPersonaId(null);
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
            <Label>Logo URL</Label>
            <Input
              className="mt-1"
              value={orgForm.logoUrl}
              onChange={(e) => setOrgForm((f) => ({ ...f, logoUrl: e.target.value }))}
              disabled={!canEdit}
              placeholder="https://example.com/logo.png"
              type="url"
            />
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
          <span className="ml-auto text-xs text-muted-foreground">{personas.length}/3</span>
          {canEdit && personas.length < 3 && !showPersonaForm && (
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
        {personas.length > 0 && (
          <div className="space-y-3 mb-4">
            {personas.map((persona) => (
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

        {personas.length === 0 && !showPersonaForm && (
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
          <span className="ml-auto text-xs text-muted-foreground">{members.length} member{members.length !== 1 ? "s" : ""}</span>
        </div>

        <div className="rounded-lg border border-border bg-card divide-y divide-border">
          {members.length === 0 ? (
            <div className="px-4 py-6 text-center text-sm text-muted-foreground">
              No members found
            </div>
          ) : (
            members.map((member) => (
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

        <p className="mt-2 text-xs text-muted-foreground">
          To invite new members, have them sign up and contact an admin to link their account.
        </p>
      </section>

      {/* ── Integrations ── */}
      <section>
        <div className="mb-4 flex items-center gap-2">
          <Plug className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-base font-semibold">Channel Integrations</h2>
        </div>

        {integrations.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border bg-card px-4 py-8 text-center">
            <Plug className="mx-auto mb-2 h-6 w-6 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">No channel integrations connected yet.</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Connect LinkedIn, Twitter, or email platforms to enable direct publishing.
            </p>
          </div>
        ) : (
          <div className="rounded-lg border border-border bg-card divide-y divide-border">
            {integrations.map((integration) => (
              <div key={integration.id} className="flex items-center gap-3 px-4 py-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border bg-muted text-muted-foreground">
                  {CHANNEL_ICONS[integration.channel] ?? <Plug className="h-4 w-4" />}
                </div>

                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium capitalize">{integration.channel}</p>
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
