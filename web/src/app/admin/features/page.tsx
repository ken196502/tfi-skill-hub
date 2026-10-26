import type { Metadata } from "next";
import { FeaturesContent } from "@/components/admin/features-content";

export const metadata: Metadata = {
  title: "首页精选",
};

export default function AdminFeaturesPage() {
  return <FeaturesContent />;
}
