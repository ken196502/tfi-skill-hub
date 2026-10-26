import type { Metadata } from "next";
import { ContentManagement } from "@/components/admin/content-management";

export const metadata: Metadata = {
  title: "内容管理",
};

export default function AdminContentPage() {
  return <ContentManagement />;
}
