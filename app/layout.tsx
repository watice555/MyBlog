import type { Metadata, Viewport } from "next";
import "@fontsource-variable/source-serif-4/wght.css";
import "@fontsource-variable/source-serif-4/wght-italic.css";
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
    default: "凝泠｜watice’s blog",
    template: "%s｜凝泠",
  },
  description: "关于金融、科技与时代变化的独立评论。记录事实，拆解叙事，在噪声里寻找清晰判断。",
  icons: {
    icon: `${publicBasePath}/favicon.svg`,
    shortcut: `${publicBasePath}/favicon.svg`,
  },
  openGraph: {
    title: "凝泠｜在噪声里辨认真实",
    description: "关于金融、科技与时代变化的独立评论。",
    type: "website",
    locale: "zh_CN",
    images: [{ url: `${publicBasePath}/og.png`, width: 1200, height: 630, alt: "凝泠 watice’s blog" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "凝泠｜在噪声里辨认真实",
    description: "关于金融、科技与时代变化的独立评论。",
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
