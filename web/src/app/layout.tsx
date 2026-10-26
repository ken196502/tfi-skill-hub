import type { Metadata } from "next";
import { cookies } from "next/headers";
import "./globals.css";
import { AppProviders } from "@/components/providers/app-providers";
import { LOCALE_COOKIE, htmlLang, resolveLocale } from "@/i18n/config";

export const metadata: Metadata = {
  title: {
    default: "TFI Skill Hub",
    template: "%s · TFI Skill Hub",
  },
  description: "企业自有 AI 技能与知识库：浏览、收藏并下载。",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const store = await cookies();
  const locale = resolveLocale(store.get(LOCALE_COOKIE)?.value);

  return (
    <html
      lang={htmlLang(locale)}
      suppressHydrationWarning
      className="h-full antialiased"
      // 声明 html 使用 scroll-behavior: smooth（globals.css），让路由过渡期间
      // 的滚动变为即时跳转，避免与列表滚动位置恢复互相竞争（Next.js 约定）。
      data-scroll-behavior="smooth"
    >
      <body className="flex min-h-full flex-col">
        <AppProviders initialLocale={locale}>{children}</AppProviders>
      </body>
    </html>
  );
}
