import type { Metadata } from "next";
import { UsersContent } from "@/components/admin/users-content";

export const metadata: Metadata = {
  title: "用户管理",
};

export default function AdminUsersPage() {
  return <UsersContent />;
}
