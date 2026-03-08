import { serverApi } from "@/lib/server-api";
import { BrandKit } from "./brand-kit";

export const metadata = { title: "Brand Kit" };

interface Brand {
  id: string;
  name: string;
  tagline?: string;
  description?: string;
  logoUrl?: string;
  websiteUrl?: string;
  primaryColor?: string;
  voiceTone?: string;
  targetAudience?: string;
  products?: Array<{ name: string; description: string }>;
  isActive: boolean;
  createdAt: string;
}

export default async function BrandsPage() {
  let brand: Brand | null = null;
  try {
    const res = await serverApi.get<{ data: Brand[] }>("/brands");
    brand = res.data[0] ?? null;
  } catch {
    // No brand yet — show empty form
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Brand Kit</h1>
        <p className="text-sm text-muted-foreground">
          Your brand profile is used by all AI agents to generate on-brand strategy, content, and visuals.
        </p>
      </div>
      <BrandKit initialBrand={brand} />
    </div>
  );
}
