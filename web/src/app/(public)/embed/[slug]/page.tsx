import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { loadPublicPage } from "@/features/public-booking/api/public-page-data";
import { WidgetFrame } from "@/features/public-booking/components/widget-frame";

export const metadata: Metadata = { title: "Book online", robots: { index: false } };

/** What the booking widget shows in its frame on the business's own website. */
export default async function EmbedPage({ params }: PageProps<"/embed/[slug]">) {
  const { slug } = await params;
  const data = await loadPublicPage(slug);

  if (!data) notFound();

  return (
    <WidgetFrame
      allowGuestBooking={data.business.allowGuestBooking}
      businessName={data.business.name}
      slug={data.business.slug}
    />
  );
}
