"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { downloadFileFromApi } from "@/lib/api-client";
import { useAppToast } from "@/hooks/use-app-toast";
import { Download, Loader2, FileText } from "lucide-react";

export function DownloadReportButton({ campaignId }: { campaignId: string }) {
  const toast = useAppToast();
  const [loading, setLoading] = useState(false);
  const [clientLoading, setClientLoading] = useState(false);

  async function handleDownload() {
    setLoading(true);
    try {
      await downloadFileFromApi(`/campaigns/${campaignId}/report`, `report-${campaignId}.pdf`);
    } catch (err: any) {
      toast.error(err.message ?? "Failed to download report");
    } finally {
      setLoading(false);
    }
  }

  async function handleClientReport() {
    setClientLoading(true);
    try {
      await downloadFileFromApi(`/campaigns/${campaignId}/client-report`, `client-report-${campaignId}.pdf`);
    } catch (err: any) {
      toast.error(err.message ?? "Failed to download client report");
    } finally {
      setClientLoading(false);
    }
  }

  return (
    <div className="flex items-center gap-1.5">
      <Button variant="outline" size="sm" className="gap-2 shrink-0" onClick={handleClientReport} disabled={clientLoading}>
        {clientLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
        Download Client Report
      </Button>
      <Button variant="ghost" size="sm" className="gap-2 shrink-0" onClick={handleDownload} disabled={loading} title="Download basic report">
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
      </Button>
    </div>
  );
}
