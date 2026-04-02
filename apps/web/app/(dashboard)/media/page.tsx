import { serverApi } from "@/lib/server-api";
import { MediaLibrary, type MediaAsset } from "./media-library";

export const metadata = { title: "Media Library" };

export default async function MediaPage() {
  let assets: MediaAsset[] = [];
  try {
    const res = await serverApi.get<{ data: MediaAsset[] }>("/media");
    assets = res.data ?? [];
  } catch {}

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Media Library</h1>
        <p className="text-sm text-muted-foreground">
          Upload and manage brand assets — photos, graphics, and visuals for your campaigns.
        </p>
      </div>

      <MediaLibrary initialAssets={assets} />
    </div>
  );
}
