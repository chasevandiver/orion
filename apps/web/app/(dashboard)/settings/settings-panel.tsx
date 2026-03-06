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
} from "lucide-react";

interface OrgData {
  id: string;
  name: string;
  slug: string;
  website?: string;
  logoUrl?: string;
  plan: string;
  createdAt: string;
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

interface SettingsPanelProps {
  org: OrgData;
  members: Member[];
  integrations: Integration[];
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

export function SettingsPanel({
  org: initialOrg,
  members: initialMembers,
  integrations: initialIntegrations,
  currentUserId,
  currentUserRole,
}: SettingsPanelProps) {
  const [org, setOrg] = useState(initialOrg);
  const [members, setMembers] = useState(initialMembers);
  const [integrations, setIntegrations] = useState(initialIntegrations);

  const [orgForm, setOrgForm] = useState({
    name: org.name,
    website: org.website ?? "",
    logoUrl: org.logoUrl ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [removingMember, setRemovingMember] = useState<string | null>(null);
  const [disconnecting, setDisconnecting] = useState<string | null>(null);
  const [validating, setValidating] = useState<string | null>(null);
  const [validationResults, setValidationResults] = useState<
    Record<string, { valid: boolean; errorMessage?: string; checkedAt: string }>
  >({});

  const canEdit = currentUserRole === "owner" || currentUserRole === "admin";
  const isOwner = currentUserRole === "owner";

  async function handleSaveOrg() {
    setSaving(true);
    setSaved(false);
    try {
      const res = await api.patch<{ data: OrgData }>("/settings/org", orgForm);
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
                {/* Avatar */}
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium uppercase">
                  {member.name?.[0] ?? member.email[0]}
                </div>

                {/* Info */}
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

                {/* Remove button — owners can remove others (not themselves) */}
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

                  {/* Validate token button */}
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

                  {/* Show validation result */}
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
