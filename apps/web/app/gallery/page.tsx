/**
 * Public Gallery — shows all published assets for an org's public brand page.
 * Accessible at /gallery?org=<slug> — no auth required.
 * Used for social proof / portfolio sharing.
 */
import { db } from "@orion/db";
import { organizations, assets, campaigns } from "@orion/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { notFound } from "next/navigation";
import Image from "next/image";

export const dynamic = "force-dynamic";

interface GalleryPageProps {
  searchParams: { org?: string };
}

export default async function GalleryPage({ searchParams }: GalleryPageProps) {
  const slug = searchParams.org;
  if (!slug) notFound();

  const org = await db.query.organizations.findFirst({
    where: eq(organizations.slug, slug),
    columns: {
      id: true,
      name: true,
      slug: true,
      logoUrl: true,
      brandPrimaryColor: true,
      website: true,
    },
  });

  if (!org) notFound();

  // Fetch approved assets with composited images
  const publishedAssets = await db.query.assets.findMany({
    where: and(
      eq(assets.orgId, org.id),
      eq(assets.status, "approved"),
    ),
    orderBy: desc(assets.createdAt),
    limit: 48,
    columns: {
      id: true,
      channel: true,
      contentText: true,
      imageUrl: true,
      compositedImageUrl: true,
      createdAt: true,
      campaignId: true,
    },
  });

  const brandColor = org.brandPrimaryColor ?? "#6366f1";

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-100 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {org.logoUrl && (
              <Image
                src={org.logoUrl}
                alt={org.name}
                width={32}
                height={32}
                className="rounded-full object-cover"
              />
            )}
            <span className="font-semibold text-gray-900">{org.name}</span>
          </div>
          {org.website && (
            <a
              href={org.website}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-gray-500 hover:text-gray-900 transition-colors"
            >
              Visit website →
            </a>
          )}
        </div>
      </header>

      {/* Hero */}
      <div
        className="py-16 px-4 text-center text-white"
        style={{ background: `linear-gradient(135deg, ${brandColor}dd, ${brandColor}88)` }}
      >
        <h1 className="text-3xl font-bold mb-2">{org.name} Content Gallery</h1>
        <p className="text-white/80 text-lg">
          {publishedAssets.length} published {publishedAssets.length === 1 ? "asset" : "assets"}
        </p>
      </div>

      {/* Gallery grid */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        {publishedAssets.length === 0 ? (
          <div className="text-center py-20 text-gray-400">
            <p className="text-xl">No published assets yet.</p>
          </div>
        ) : (
          <div className="columns-1 sm:columns-2 lg:columns-3 xl:columns-4 gap-4 space-y-4">
            {publishedAssets.map((asset) => {
              const imgUrl = asset.compositedImageUrl ?? asset.imageUrl;
              return (
                <div
                  key={asset.id}
                  className="break-inside-avoid bg-white rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-shadow border border-gray-100"
                >
                  {imgUrl && (
                    <div className="relative w-full aspect-square bg-gray-100">
                      <Image
                        src={imgUrl}
                        alt="Marketing asset"
                        fill
                        className="object-cover"
                        sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
                      />
                    </div>
                  )}
                  <div className="p-3">
                    <div className="flex items-center gap-2 mb-2">
                      <span
                        className="text-xs font-medium px-2 py-0.5 rounded-full text-white"
                        style={{ backgroundColor: brandColor }}
                      >
                        {asset.channel}
                      </span>
                    </div>
                    {asset.contentText && (
                      <p className="text-xs text-gray-600 line-clamp-3 leading-relaxed">
                        {asset.contentText}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-100 py-8 text-center text-gray-400 text-sm">
        <p>
          Powered by{" "}
          <span className="font-medium text-gray-600">ORION</span> Marketing Intelligence
        </p>
      </footer>
    </div>
  );
}
