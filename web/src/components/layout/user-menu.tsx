"use client";

import { LogOut, Star } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useCurrentUser, useLogout } from "@/hooks/use-auth";
import { useI18n } from "@/i18n";

export function UserMenu() {
  const { user } = useCurrentUser();
  const logout = useLogout();
  const { t } = useI18n();
  const router = useRouter();

  if (!user) return null;

  const initial = (user.displayName || user.handle).slice(0, 1).toUpperCase();

  const handleLogout = () => {
    logout.mutate(undefined, {
      onSuccess: () => {
        toast.success(t("auth.logoutSuccess"));
        router.push("/");
      },
    });
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="size-9 rounded-full" aria-label={user.handle}>
          <Avatar className="size-8">
            <AvatarFallback className="text-xs">{initial}</AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuLabel>
          <div className="flex flex-col">
            <span className="text-sm font-medium">{user.displayName || user.handle}</span>
            <span className="text-xs font-normal text-muted-foreground">@{user.handle}</span>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/favorites" className="cursor-pointer gap-2">
            <Star className="size-4" />
            {t("nav.favorites")}
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={handleLogout}
          className="cursor-pointer gap-2 text-destructive focus:text-destructive"
        >
          <LogOut className="size-4" />
          {t("nav.logout")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
