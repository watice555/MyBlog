import { useState, type MouseEvent } from "react";
import "@fontsource-variable/source-serif-4/wght.css";
import "@fontsource-variable/source-serif-4/wght-italic.css";
import "../../app/globals.css";
import "../../app/home.css";
import "./preview.css";
import { generatedPosts } from "../../app/generated-posts";
import { HomeView } from "../../app/components/home-views";
import { SiteHeader, SiteFooter } from "../../app/components/site-chrome";
import { OriginalHome } from "./OriginalHome";
import { absoluteUrl, siteUrl } from "../../lib/site";

function resolveOriginalLinks(element: HTMLElement | null) {
  element?.querySelectorAll("a").forEach((anchor) => {
    const href = anchor.getAttribute("href");
    if (href && href !== "#recent") anchor.href = absoluteUrl(href);
  });
}

export default function Preview() {
  const [original, setOriginal] = useState(false);
  // Keep homepage navigation inside the comparison; article links use the live site.
  function followLink(event: MouseEvent<HTMLDivElement>) {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const anchor = (event.target as HTMLElement).closest("a");
    const href = anchor?.getAttribute("href");
    if (href === `${siteUrl}#home`) {
      event.preventDefault();
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }
  return <>
    <div className="preview-toolbar">
      <span>本地布局预览</span>
      <div role="group" aria-label="首页布局对比">
        <button type="button" aria-pressed={!original} onClick={() => setOriginal(false)}>新布局</button>
        <button type="button" aria-pressed={original} onClick={() => setOriginal(true)}>原布局</button>
      </div>
      <a href={siteUrl} target="_blank" rel="noreferrer">打开正式站 ↗</a>
    </div>
    <div className={`site-shell ${original ? "original-layout" : "home-layout"}`} onClick={followLink}>
      <SiteHeader root={siteUrl} />
      {original ? <main key="original" ref={resolveOriginalLinks}><OriginalHome articles={generatedPosts} /></main> : <main key="current" ref={resolveOriginalLinks}><HomeView articles={generatedPosts} /></main>}
      <SiteFooter root={siteUrl} />
    </div>
  </>;
}
