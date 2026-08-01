import type { Metadata, Viewport } from "next";
import "./globals.css";

const repository = process.env.GITHUB_REPOSITORY?.split("/")[1] ?? "";
const owner = process.env.GITHUB_REPOSITORY_OWNER ?? "";
const isUserSite = repository.endsWith(".github.io");
const publicBasePath = process.env.GITHUB_ACTIONS && repository && !isUserSite
  ? `/${repository}`
  : "";
const productionUrl = owner
  ? `https://${owner}.github.io${isUserSite ? "" : `/${repository}`}`
  : "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? productionUrl),
  title: {
    default: "一隅｜个人文字博客",
    template: "%s｜一隅",
  },
  description: "收藏日常、阅读与偶尔路过心里的念头。一个简约清新的个人文字博客。",
  icons: {
    icon: `${publicBasePath}/favicon.svg`,
    shortcut: `${publicBasePath}/favicon.svg`,
  },
  openGraph: {
    title: "一隅｜把日子写成慢慢展开的纸",
    description: "在喧闹世界里，留一页纸给自己。",
    type: "website",
    locale: "zh_CN",
    images: [{ url: `${publicBasePath}/og.png`, width: 1200, height: 630, alt: "一隅个人文字博客" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "一隅｜把日子写成慢慢展开的纸",
    description: "在喧闹世界里，留一页纸给自己。",
    images: [`${publicBasePath}/og.png`],
  },
};

export const viewport: Viewport = {
  themeColor: "#f5f3ec",
  colorScheme: "light",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
