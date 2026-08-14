import type { Metadata } from "next";

import { ProfileOverview } from "@/features/profile/components/profile-overview";

export const metadata: Metadata = { title: "Profile" };

export default function ProfilePage() {
  return <ProfileOverview />;
}
