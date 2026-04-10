import { notFound } from "next/navigation";
import { db } from "@orion/db";
import { landingPages, organizations } from "@orion/db/schema";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

interface ContentJson {
  heroSection?: {
    headline?: string;
    subheadline?: string;
    ctaText?: string;
    ctaButtonLabel?: string;
  };
  benefitsSections?: Array<{ icon?: string; title?: string; description?: string }>;
  socialProof?: Array<{ quote?: string; author?: string; company?: string; role?: string }>;
  faqSection?: Array<{ question?: string; answer?: string }>;
  ctaSection?: {
    headline?: string;
    subtext?: string;
    buttonLabel?: string;
    formFields?: string[];
  };
}

export async function generateMetadata({ params }: { params: { token: string } }) {
  const page = await db.query.landingPages.findFirst({
    where: eq(landingPages.shareToken, params.token),
    columns: { metaTitle: true, metaDescription: true, title: true },
  });
  if (!page) return { title: "Page Not Found" };
  return {
    title: page.metaTitle ?? page.title,
    description: page.metaDescription ?? undefined,
  };
}

export default async function PublicLandingPage({ params }: { params: { token: string } }) {
  const page = await db.query.landingPages.findFirst({
    where: eq(landingPages.shareToken, params.token),
    columns: {
      title: true,
      contentJson: true,
      publishedAt: true,
      orgId: true,
    },
  });

  if (!page || !page.publishedAt) notFound();

  const org = await db.query.organizations.findFirst({
    where: eq(organizations.id, page.orgId),
    columns: { name: true, logoUrl: true, brandPrimaryColor: true },
  });

  const content = (page.contentJson ?? {}) as ContentJson;
  const hero = content.heroSection ?? {};
  const benefits = content.benefitsSections ?? [];
  const proof = content.socialProof ?? [];
  const faq = content.faqSection ?? [];
  const cta = content.ctaSection ?? {};
  const brandColor = org?.brandPrimaryColor ?? "#7c3aed";

  return (
    <div className="min-h-screen bg-white text-gray-900 font-sans">
      {/* Nav */}
      <nav className="border-b border-gray-100 px-6 py-4 flex items-center gap-3">
        {org?.logoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={org.logoUrl} alt={org?.name ?? ""} className="h-8 w-auto object-contain" />
        )}
        <span className="font-semibold text-gray-800">{org?.name}</span>
      </nav>

      {/* Hero */}
      <section
        className="px-6 py-24 text-center max-w-3xl mx-auto"
        style={{ "--brand": brandColor } as React.CSSProperties}
      >
        {hero.headline && (
          <h1 className="text-5xl font-extrabold leading-tight mb-6 text-gray-900">
            {hero.headline}
          </h1>
        )}
        {hero.subheadline && (
          <p className="text-xl text-gray-500 mb-10 leading-relaxed">{hero.subheadline}</p>
        )}
        {hero.ctaButtonLabel && (
          <a
            href="#cta"
            className="inline-block rounded-full px-8 py-4 text-white font-bold text-lg shadow-lg hover:opacity-90 transition-opacity"
            style={{ background: brandColor }}
          >
            {hero.ctaButtonLabel}
          </a>
        )}
      </section>

      {/* Benefits */}
      {benefits.length > 0 && (
        <section className="bg-gray-50 py-20 px-6">
          <div className="max-w-5xl mx-auto">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {benefits.map((b, i) => (
                <div key={i} className="bg-white rounded-2xl p-8 shadow-sm">
                  {b.icon && <div className="text-4xl mb-4">{b.icon}</div>}
                  {b.title && <h3 className="text-lg font-bold mb-2">{b.title}</h3>}
                  {b.description && <p className="text-gray-500 leading-relaxed">{b.description}</p>}
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Social Proof */}
      {proof.length > 0 && (
        <section className="py-20 px-6">
          <div className="max-w-5xl mx-auto">
            <h2 className="text-3xl font-bold text-center mb-12">What people are saying</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {proof.map((p, i) => (
                <div key={i} className="rounded-2xl border border-gray-100 p-8">
                  {p.quote && (
                    <p className="text-gray-700 italic leading-relaxed mb-6">&ldquo;{p.quote}&rdquo;</p>
                  )}
                  <div>
                    <p className="font-semibold">{p.author}</p>
                    {(p.role || p.company) && (
                      <p className="text-sm text-gray-400">
                        {[p.role, p.company].filter(Boolean).join(", ")}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* FAQ */}
      {faq.length > 0 && (
        <section className="bg-gray-50 py-20 px-6">
          <div className="max-w-3xl mx-auto">
            <h2 className="text-3xl font-bold text-center mb-12">Frequently asked questions</h2>
            <div className="space-y-4">
              {faq.map((item, i) => (
                <div key={i} className="bg-white rounded-xl p-6 border border-gray-100">
                  <p className="font-semibold mb-2">{item.question}</p>
                  <p className="text-gray-500 leading-relaxed">{item.answer}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* CTA */}
      {(cta.headline || cta.buttonLabel) && (
        <section id="cta" className="py-24 px-6 text-center">
          <div
            className="max-w-2xl mx-auto rounded-3xl py-16 px-10 text-white"
            style={{ background: brandColor }}
          >
            {cta.headline && <h2 className="text-4xl font-extrabold mb-4">{cta.headline}</h2>}
            {cta.subtext && <p className="text-white/80 text-lg mb-10">{cta.subtext}</p>}
            {cta.buttonLabel && (
              <button className="bg-white rounded-full px-8 py-4 font-bold text-lg shadow-lg hover:opacity-90 transition-opacity" style={{ color: brandColor }}>
                {cta.buttonLabel}
              </button>
            )}
          </div>
        </section>
      )}

      {/* Footer */}
      <footer className="border-t border-gray-100 py-8 px-6 text-center text-sm text-gray-400">
        <p>
          {org?.name && <span>© {org.name} · </span>}
          Powered by <span className="font-semibold text-gray-500">STELOS</span>
        </p>
      </footer>
    </div>
  );
}
