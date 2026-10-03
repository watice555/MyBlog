export function SiteHeader({ active = "home", root = "./", editorEnabled = false }: { active?: string; root?: string; editorEnabled?: boolean }) {
  return <header className="site-header">
    <a className="brand" href={`${root}#home`} aria-label="凝泠博客首页">
      <span className="brand-mark">凝泠</span><span className="brand-note">watice’s blog</span>
    </a>
    <nav className="site-nav" aria-label="主导航">
      <a className={active === "home" ? "active" : ""} href={`${root}#home`}>首页</a>
      <a className={active === "archive" ? "active" : ""} href={`${root}#archive`}>文章</a>
      <a className={active === "about" ? "active" : ""} href={`${root}#about`}>关于</a>
      {editorEnabled && <>
        <a className={active === "drafts" ? "active" : ""} href={`${root}#drafts`}>草稿箱</a>
        <a className="editor-link" href={`${root}#editor`}>写文章 <span aria-hidden="true">↗</span></a>
      </>}
    </nav>
  </header>;
}

export function SiteFooter({ root = "./", editorEnabled = false }: { root?: string; editorEnabled?: boolean }) {
  return <footer className="site-footer">
    <div><span className="footer-brand">凝泠</span><p>在噪声里保持清醒，在变化中寻找结构。</p></div>
    <div className="footer-links">
      <a href={`${root}#home`}>首页</a><a href={`${root}#archive`}>文章</a><a href={`${root}#about`}>关于</a>
      <a href={`${root}feed.xml`}>RSS</a>
      {editorEnabled && <><a href={`${root}#drafts`}>草稿箱</a><a href={`${root}#editor`}>编辑器</a></>}
    </div>
    <p className="copyright">© 2026 凝泠 · watice’s blog</p>
  </footer>;
}
