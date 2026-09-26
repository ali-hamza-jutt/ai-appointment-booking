import type { Metadata } from "next";

import { TeamView } from "@/features/business-settings/components/team-view";

export const metadata: Metadata = { title: "Team" };

export default function TeamPage() {
  return <TeamView />;
}
