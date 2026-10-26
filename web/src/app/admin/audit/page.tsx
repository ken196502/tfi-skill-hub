import type { Metadata } from "next";
import { AuditContent } from "@/components/admin/audit-content";

export const metadata: Metadata = {
  title: "审计日志",
};

export default function AdminAuditPage() {
  return <AuditContent />;
}
