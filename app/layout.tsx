import type { Metadata, Viewport } from "next";
import "@fontsource-variable/source-serif-4/wght.css";
import "@fontsource-variable/source-serif-4/wght-italic.css";
import "./globals.css";
import { absoluteUrl, siteDescription, siteTitle, siteUrl } from "../lib/site";

const repository = process.env.GITHUB_REPOSITORY?.split("/")[1] ?? "";
const isUserSite = repository.endsWith(".github.io");
const publicBasePath = process.env.GITHUB_ACTIONS && repository && !isUserSite
  ? `/${repository}`
  : "";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: siteTitle,
    template: "%s｜凝泠",
  },
  description: siteDescription,
  alternates: { canonical: absoluteUrl(), types: { "application/rss+xml": absoluteUrl("feed.xml") } },
  icons: {
    icon: `${publicBasePath}/favicon.svg`,
    shortcut: `${publicBasePath}/favicon.svg`,
  },
  openGraph: {
    title: "凝泠｜在噪声里辨认真实",
    description: "关于金融、科技与时代变化的独立评论。",
    type: "website",
    locale: "zh_CN",
    url: absoluteUrl(),
    images: [{ url: absoluteUrl("og.png"), width: 1200, height: 630, alt: "凝泠 watice’s blog" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "凝泠｜在噪声里辨认真实",
    description: "关于金融、科技与时代变化的独立评论。",
    images: [absoluteUrl("og.png")],
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
