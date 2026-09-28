import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { BookWiseLogo } from "@/components/brand/bookwise-logo";
import { VERTICAL_ICONS } from "@/features/business-settings/constants/business-ui.constants";
import { loadPublicPage } from "@/features/public-booking/api/public-page-data";
import { PublicBookingPanel } from "@/features/public-booking/components/public-booking-panel";
import { StarRating } from "@/features/reviews/components/star-rating";
import { formatDate } from "@/lib/utils/date-time";
import { formatMoney } from "@/lib/utils/money";

export async function generateMetadata({ params }: PageProps<"/b/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const data = await loadPublicPage(slug);

  if (!data) return { title: "Business not found" };

  const { business, reviews, services } = data;
  const rating = reviews.average !== null ? ` Rated ${reviews.average.toFixed(1)}/5 by ${reviews.count} customers.` : "";

  return {
    title: `Book ${business.name}`,
    description: `Book ${services
      .slice(0, 3)
      .map((service) => service.name)
      .join(", ")} and more with ${business.name} online.${rating}`,
  };
}

export default async function PublicBookingPage({ params }: PageProps<"/b/[slug]">) {
  const { slug } = await params;
  const data = await loadPublicPage(slug);

  if (!data) notFound();

  const { business, reviews, services } = data;
  const VerticalIcon = VERTICAL_ICONS[business.vertical];

  return (
    <div className="min-h-dvh bg-canvas">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-6">
          <BookWiseLogo compact href="/" />
          <span className="text-xs text-muted">Online booking</span>
        </div>
      </header>

      <main className="mx-auto grid max-w-6xl gap-8 px-4 py-8 sm:px-6 lg:grid-cols-[minmax(0,1fr)_440px]">
        <div className="space-y-8">
          <section className="flex items-center gap-4">
            <span className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-brand-soft text-brand">
              <VerticalIcon className="size-7" />
            </span>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-ink">{business.name}</h1>
              {reviews.average !== null ? (
                <p className="mt-1 flex items-center gap-2 text-sm text-muted">
                  <StarRating rating={reviews.average} />
                  {reviews.average.toFixed(1)} · {reviews.count} review{reviews.count === 1 ? "" : "s"}
                </p>
              ) : null}
            </div>
          </section>

          <section aria-labelledby="services-heading">
            <h2 className="text-base font-semibold text-ink" id="services-heading">
              Services
            </h2>
            {services.length === 0 ? (
              <p className="mt-2 text-sm text-muted">Nothing can be booked online right now.</p>
            ) : (
              <ul className="mt-3 divide-y divide-border rounded-xl border border-border bg-surface">
                {services.map((service) => (
                  <li className="flex items-start justify-between gap-4 px-5 py-4" key={service.id}>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-ink">{service.name}</p>
                      {service.description ? (
                        <p className="mt-0.5 text-sm text-muted">{service.description}</p>
                      ) : null}
                      <p className="mt-1 text-xs text-subtle">
                        {service.durationMinutes} min{service.categoryName ? ` · ${service.categoryName}` : ""}
                      </p>
                    </div>
                    <p className="shrink-0 text-sm font-semibold text-ink">
                      {service.priceMinor > 0 ? formatMoney(service.priceMinor, service.currency) : "Free"}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section aria-labelledby="reviews-heading">
            <h2 className="text-base font-semibold text-ink" id="reviews-heading">
              Reviews
            </h2>
            {reviews.items.length === 0 ? (
              <p className="mt-2 text-sm text-muted">No reviews yet.</p>
            ) : (
              <ul className="mt-3 space-y-3">
                {reviews.items.map((review, index) => (
                  <li className="rounded-xl border border-border bg-surface px-5 py-4" key={index}>
                    <div className="flex flex-wrap items-center gap-2">
                      <StarRating rating={review.rating} />
                      <span className="text-sm font-semibold text-ink">{review.author}</span>
                      <span className="text-xs text-subtle">
                        {review.serviceName} · {formatDate(review.createdAt)}
                      </span>
                    </div>
                    {review.comment ? <p className="mt-2 text-sm leading-6 text-ink-soft">{review.comment}</p> : null}
                    {review.reply ? (
                      <p className="mt-3 rounded-[10px] bg-surface-subtle px-4 py-3 text-sm text-ink-soft">
                        <span className="block text-xs font-semibold text-muted">Reply from {business.name}</span>
                        {review.reply}
                      </p>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <aside className="lg:sticky lg:top-6 lg:self-start">
          <div className="overflow-hidden rounded-xl border border-border bg-surface pt-3 shadow-card">
            <PublicBookingPanel allowGuestBooking={business.allowGuestBooking} slug={business.slug} />
          </div>
        </aside>
      </main>
    </div>
  );
}
