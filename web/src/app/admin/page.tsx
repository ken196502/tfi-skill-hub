import type { Metadata } from "next";
import { DashboardContent } from "@/components/admin/dashboard-content";

export const metadata: Metadata = {
  title: "管理控制台",
};

export default function AdminDashboardPage() {
  return <DashboardContent />;
}
