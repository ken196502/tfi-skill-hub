import type { Metadata } from "next";
import { ApiKeysContent } from "@/components/admin/api-keys-content";

export const metadata: Metadata = {
  title: "API Keys",
};

export default function AdminApiKeysPage() {
  return <ApiKeysContent />;
}
