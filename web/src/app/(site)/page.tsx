import type { Metadata } from "next";
import { HomeContent } from "@/components/home/home-content";

export const metadata: Metadata = {
  // Absolute: skip the "%s · TFI Skill Hub" template to avoid duplication.
  title: { absolute: "TFI Skill Hub" },
};

export default function HomePage() {
  return <HomeContent />;
}
