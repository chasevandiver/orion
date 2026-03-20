"use client";

import { useState } from "react";
import { api } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Users, Search, Trash2, Loader2, Upload, Download } from "lucide-react";
import Link from "next/link";
import { Textarea } from "@/components/ui/textarea";
import { useAppToast } from "@/hooks/use-app-toast";

const STATUS_COLORS: Record<string, string> = {
  cold: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  warm: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
  hot: "bg-orange-500/10 text-orange-400 border-orange-500/20",
  customer: "bg-orion-green/10 text-orion-green border-orion-green/20",
  churned: "bg-muted text-muted-foreground border-border",
};

function LeadScoreDot({ score }: { score: number }) {
  const color =
    score >= 80
      ? "bg-orion-green"
      : score >= 50
        ? "bg-yellow-400"
        : score >= 20
          ? "bg-orange-400"
          : "bg-muted-foreground/40";
  return (
    <div className="flex items-center gap-1.5">
      <div className={`h-2 w-2 rounded-full ${color}`} />
      <span className="tabular-nums">{score}</span>
    </div>
  );
}

interface Contact {
  id: string;
  email: string;
  name?: string;
  company?: string;
  title?: string;
  status: string;
  leadScore: number;
  sourceChannel?: string;
  createdAt: string;
}

export function ContactsTable({ initialContacts }: { initialContacts: Contact[] }) {
  const toast = useAppToast();
  const [contacts, setContacts] = useState(initialContacts);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  // Import CSV state
  const [importOpen, setImportOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{
    imported: number;
    skipped: number;
    errors: { row: number; reason: string }[];
  } | null>(null);

  const [form, setForm] = useState({
    email: "",
    name: "",
    company: "",
    title: "",
    notes: "",
  });

  const filtered = contacts.filter((c) => {
    const matchesSearch =
      !search ||
      c.email.toLowerCase().includes(search.toLowerCase()) ||
      c.name?.toLowerCase().includes(search.toLowerCase()) ||
      c.company?.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === "all" || c.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    try {
      const res = await api.post<{ data: Contact }>("/contacts", form);
      setContacts((prev) => [res.data, ...prev]);
      setOpen(false);
      setForm({ email: "", name: "", company: "", title: "", notes: "" });
    } catch (err: any) {
      toast.error(err.message ?? "Failed to add contact");
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this contact?")) return;
    setDeleting(id);
    try {
      await api.delete(`/contacts/${id}`);
      setContacts((prev) => prev.filter((c) => c.id !== id));
    } catch (err: any) {
      toast.error(err.message ?? "Failed to delete contact");
    } finally {
      setDeleting(null);
    }
  }

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    setImportResult(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await api.postForm<{ data: { imported: number; skipped: number; errors: { row: number; reason: string }[] } }>(
        "/contacts/import",
        formData,
      );
      setImportResult(res.data);
      // Refresh contacts list if any were imported
      if (res.data.imported > 0) {
        const refreshed = await api.get<{ data: Contact[] }>("/contacts");
        setContacts(refreshed.data);
      }
    } catch (err: any) {
      toast.error(err.message ?? "Failed to import contacts");
      setImportOpen(false);
    } finally {
      setImporting(false);
      // Reset file input
      e.target.value = "";
    }
  }

  function handleDownloadTemplate() {
    const headers = "firstName,lastName,email,company,notes";
    const example = "Jane,Smith,jane@example.com,Acme Corp,Met at conference";
    const blob = new Blob([headers + "\n" + example + "\n"], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "contacts-template.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Search by name, email, or company…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {["cold", "warm", "hot", "customer", "churned"].map((s) => (
              <SelectItem key={s} value={s} className="capitalize">
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {/* Import CSV */}
        <Dialog open={importOpen} onOpenChange={(v) => { setImportOpen(v); if (!v) setImportResult(null); }}>
          <DialogTrigger asChild>
            <Button size="sm" variant="outline" className="gap-2 shrink-0">
              <Upload className="h-4 w-4" />
              Import CSV
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Import Contacts from CSV</DialogTitle>
            </DialogHeader>
            {importResult ? (
              <div className="space-y-4 pt-2">
                <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-1.5 text-sm">
                  <p><span className="font-medium text-orion-green">{importResult.imported}</span> contacts imported</p>
                  <p><span className="font-medium text-muted-foreground">{importResult.skipped}</span> rows skipped</p>
                </div>
                {importResult.errors.length > 0 && (
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-muted-foreground">Skipped rows:</p>
                    <div className="max-h-40 overflow-y-auto rounded border border-border text-xs divide-y divide-border">
                      {importResult.errors.map((e) => (
                        <div key={e.row} className="px-3 py-1.5">
                          <span className="text-muted-foreground">Row {e.row}:</span> {e.reason}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                <div className="flex justify-end">
                  <Button variant="outline" onClick={() => { setImportOpen(false); setImportResult(null); }}>
                    Close
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-4 pt-2">
                <p className="text-sm text-muted-foreground">
                  Upload a CSV with columns: <code className="text-xs bg-muted px-1 py-0.5 rounded">firstName</code>, <code className="text-xs bg-muted px-1 py-0.5 rounded">lastName</code>, <code className="text-xs bg-muted px-1 py-0.5 rounded">email</code>, <code className="text-xs bg-muted px-1 py-0.5 rounded">company</code>, <code className="text-xs bg-muted px-1 py-0.5 rounded">notes</code>. Max 1,000 rows.
                </p>
                <button
                  type="button"
                  onClick={handleDownloadTemplate}
                  className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  <Download className="h-3.5 w-3.5" />
                  Download template
                </button>
                <div className="flex items-center justify-between gap-3">
                  <Label
                    htmlFor="csv-upload"
                    className={`flex-1 cursor-pointer rounded-lg border-2 border-dashed border-border px-4 py-6 text-center text-sm transition-colors hover:border-orion-green/50 ${importing ? "opacity-50 pointer-events-none" : ""}`}
                  >
                    {importing ? (
                      <span className="flex items-center justify-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Importing…
                      </span>
                    ) : (
                      <span>Click to select a <strong>.csv</strong> file</span>
                    )}
                    <input
                      id="csv-upload"
                      type="file"
                      accept=".csv,text/csv"
                      className="sr-only"
                      onChange={handleImport}
                      disabled={importing}
                    />
                  </Label>
                </div>
                <div className="flex justify-end">
                  <Button type="button" variant="outline" onClick={() => setImportOpen(false)}>
                    Cancel
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Add Contact */}
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-2 shrink-0">
              <Plus className="h-4 w-4" />
              Add Contact
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Add Contact</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleCreate} className="space-y-4 pt-2">
              <div className="space-y-1.5">
                <Label>Email *</Label>
                <Input
                  type="email"
                  required
                  value={form.email}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                  placeholder="alex@company.com"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Name</Label>
                  <Input
                    value={form.name}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                    placeholder="Alex Johnson"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Company</Label>
                  <Input
                    value={form.company}
                    onChange={(e) => setForm((f) => ({ ...f, company: e.target.value }))}
                    placeholder="Acme Corp"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Title</Label>
                <Input
                  value={form.title}
                  onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                  placeholder="VP of Marketing"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Notes</Label>
                <Textarea
                  value={form.notes}
                  onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                  placeholder="Met at conference, interested in enterprise plan…"
                  rows={3}
                  className="resize-none"
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={creating} className="gap-2">
                  {creating && <Loader2 className="h-4 w-4 animate-spin" />}
                  Add Contact
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-16 text-center">
          <Users className="mb-4 h-10 w-10 text-muted-foreground/50" />
          {contacts.length === 0 ? (
            <>
              <p className="font-medium">No contacts yet</p>
              <p className="mt-1 max-w-xs text-sm text-muted-foreground">
                Add contacts manually or import a CSV to get started.
              </p>
              <div className="mt-6 flex gap-2">
                <Button size="sm" onClick={() => setOpen(true)}>Add Contact</Button>
                <Button size="sm" variant="outline" onClick={() => setImportOpen(true)}>Import CSV</Button>
              </div>
            </>
          ) : (
            <>
              <p className="font-medium">No contacts match your filters</p>
              <p className="mt-1 text-sm text-muted-foreground">Try adjusting your search or status filter.</p>
            </>
          )}
        </div>
      ) : (
        <div className="rounded-lg border border-border bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-xs text-muted-foreground">
                <th className="px-4 py-2.5 text-left font-normal">Contact</th>
                <th className="px-4 py-2.5 text-left font-normal">Company</th>
                <th className="px-4 py-2.5 text-left font-normal">Status</th>
                <th className="px-4 py-2.5 text-right font-normal">Score</th>
                <th className="px-4 py-2.5 text-right font-normal">Source</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((contact) => (
                <tr key={contact.id} className="group border-b border-border/50 last:border-0">
                  <td className="px-4 py-2.5">
                    <div>
                      <Link
                        href={`/contacts/${contact.id}`}
                        className="font-medium hover:text-orion-green hover:underline transition-colors"
                      >
                        {contact.name ?? contact.email}
                      </Link>
                      {contact.name && (
                        <p className="text-xs text-muted-foreground">{contact.email}</p>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-muted-foreground">
                    {contact.company ?? "—"}
                    {contact.title && (
                      <span className="block text-xs">{contact.title}</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    <span
                      className={`inline-flex items-center rounded border px-1.5 py-0.5 font-mono text-[10px] uppercase ${STATUS_COLORS[contact.status] ?? STATUS_COLORS.cold}`}
                    >
                      {contact.status}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <LeadScoreDot score={contact.leadScore} />
                  </td>
                  <td className="px-4 py-2.5 text-right text-xs capitalize text-muted-foreground">
                    {contact.sourceChannel ?? "—"}
                  </td>
                  <td className="px-4 py-2.5">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 opacity-0 group-hover:opacity-100"
                      disabled={deleting === contact.id}
                      onClick={() => handleDelete(contact.id)}
                    >
                      {deleting === contact.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      )}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
