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
  createdAt: Date | string;
}

interface Goal {
  id: string;
  brandName: string;
  brandDescription?: string;
  targetAudience?: string;
}

export default async function BrandsPage() {
  let brand: Brand | null = null;
  let autoFillData: { name: string; description: string; targetAudience: string } | null = null;

  try {
    const res = await serverApi.get<{ data: Brand[] }>("/brands");
    brand = res.data[0] ?? null;
  } catch {
    // No brand yet — show empty form
  }

  // If the brand is missing name, description, or targetAudience, auto-fill
  // from the most recent goal so the user doesn't have to retype known info.
  const needsName = !brand?.name;
  const needsDescription = !brand?.description;
  const needsAudience = !brand?.targetAudience;

  if (needsName || needsDescription || needsAudience) {
    try {
      const goalsRes = await serverApi.get<{ data: Goal[] }>("/goals");
      const latestGoal = goalsRes.data[0] ?? null;
      if (latestGoal) {
        const filled = {
          name: needsName ? (latestGoal.brandName ?? "") : "",
          description: needsDescription ? (latestGoal.brandDescription ?? "") : "",
          targetAudience: needsAudience ? (latestGoal.targetAudience ?? "") : "",
        };
        if (filled.name || filled.description || filled.targetAudience) {
          autoFillData = filled;
        }
      }
    } catch {
      // Goals fetch failed — proceed without auto-fill
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Brand Kit</h1>
        <p className="text-sm text-muted-foreground">
          Your brand profile is used by all AI agents to generate on-brand strategy, content, and visuals.
        </p>
      </div>
      <BrandKit initialBrand={brand} autoFillData={autoFillData} />
    </div>
  );
}
