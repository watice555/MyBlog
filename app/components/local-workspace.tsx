"use client";

import { type CSSProperties } from "react";
import { normalizeSlug, calculateReadTime as readTime } from "../../lib/content-utils.mjs";
import { useLocalEditor, formatDate, formatWordCount, formatRecoveryTime, type AiParticipationLevel } from "../hooks/use-local-editor";
import { Markdown } from "./markdown";
import { PageIntro, AiParticipationIndicator, AI_PARTICIPATION_LABELS } from "./article-ui";
import { RecoveryDialog } from "./recovery-dialog";
import "katex/dist/katex.min.css";

export default function LocalWorkspace() {
  const { view, draftArticles, draft, setDraft, toast, summarizing, proofreading, proofreadingSuggestions, setProofreadingSuggestions, savingMarkdown, savingDraft, uploadingImage, recovery, recoveryGateStatus, recoveryError, recoveryAction, autosaveNotice, autosaveFailed, markdownTextareaRef, imageInputRef, localAiEnabled, slugDiffersFromTitle, editorEnabled, checkRecoveryFile, editSavedDraft, startNewDraft, summarizeDraft, proofreadDraft, uploadImage, saveToDraftBox, saveMarkdownToProject, saveRecoveryAsDraft, saveRecoveryAsPost, discardRecovery } = useLocalEditor();
  return <>
      {view.name === "editor" && editorEnabled && recoveryGateStatus !== "ready" && (
        <RecoveryDialog>
          <div className="recovery-dialog">
            <p className="section-kicker">EDITOR RECOVERY</p>
            {(recoveryGateStatus === "idle" || recoveryGateStatus === "checking") && (
              <>
                <h1 id="recovery-dialog-title">正在检查临时文件</h1>
                <p id="recovery-dialog-description">确认没有待处理的自动保存内容后，编辑器才会打开。</p>
              </>
            )}
            {recoveryGateStatus === "error" && (
              <>
                <h1 id="recovery-dialog-title">暂时不能打开编辑器</h1>
                <p id="recovery-dialog-description">为避免覆盖可能存在的临时文件，请先恢复本地保存服务。</p>
                <p className="recovery-error" role="alert">{recoveryError}</p>
                <div className="recovery-actions">
                  <button className="primary-button" type="button" onClick={() => void checkRecoveryFile()}>重新检查</button>
                </div>
              </>
            )}
            {recoveryGateStatus === "needs-action" && recovery && (
              <>
                <h1 id="recovery-dialog-title">发现未处理的临时文件</h1>
                <p id="recovery-dialog-description">
                  这是 {formatRecoveryTime(recovery.savedAt)} 自动保存的内容。请明确决定它的去向，处理前编辑器不会覆盖它。
                </p>
                <div className="recovery-summary">
                  <span>{recovery.draft.articleId ? "文章修改" : recovery.draft.draftId ? "草稿修改" : "新文章"}</span>
                  <strong>{recovery.draft.title.trim() || "未命名内容"}</strong>
                  <small>正文 {recovery.draft.content.length.toLocaleString("zh-CN")} 字符</small>
                  <p>{recovery.draft.content.trim().slice(0, 260) || "正文尚未填写"}</p>
                </div>
                {recoveryError && <p className="recovery-error" role="alert">{recoveryError}</p>}
                <div className="recovery-actions">
                  <button
                    className="secondary-button"
                    type="button"
                    onClick={() => void saveRecoveryAsDraft()}
                    disabled={recoveryAction !== null}
                  >
                    {recoveryAction === "draft" ? "正在存入草稿箱…" : "存入草稿箱"}
                  </button>
                  <button
                    className="primary-button"
                    type="button"
                    onClick={() => void saveRecoveryAsPost()}
                    disabled={recoveryAction !== null || !recovery.draft.title.trim() || !recovery.draft.content.trim()}
                    title={!recovery.draft.title.trim() || !recovery.draft.content.trim() ? "需要完整的标题和正文" : undefined}
                  >
                    {recoveryAction === "post" ? "正在保存为正文…" : "保存为正文"}
                  </button>
                  <button
                    className="recovery-discard"
                    type="button"
                    onClick={() => void discardRecovery()}
                    disabled={recoveryAction !== null}
                  >
                    {recoveryAction === "discard" ? "正在丢弃…" : "丢弃临时文件"}
                  </button>
                </div>
                {(!recovery.draft.title.trim() || !recovery.draft.content.trim()) && (
                  <p className="recovery-note">临时内容不完整，只能先存入草稿箱或丢弃。</p>
                )}
              </>
            )}
          </div>
        </RecoveryDialog>
      )}

        {view.name === "drafts" && editorEnabled && (
          <section className="inner-page drafts-page">
            <PageIntro
              label="LOCAL DRAFTS"
              title="草稿箱"
              text="这里的 Markdown 只保存在本机 content/drafts，不会出现在公开文章列表或 Git 提交中。"
            />
            <div className="drafts-heading">
              <span>共 {draftArticles.length} 份本地草稿</span>
              <button className="primary-button" type="button" onClick={startNewDraft}>新建草稿</button>
            </div>
            <div className="draft-list">
              {draftArticles.map((savedDraft) => (
                <article className="draft-card" key={savedDraft.id}>
                  <div>
                    <p>{savedDraft.sourceArticleId ? "正式文章的修改草稿" : "未发布草稿"} · {savedDraft.date}</p>
                    <h2>{savedDraft.title || "未命名草稿"}</h2>
                    <span>{savedDraft.category} · {formatWordCount(savedDraft.content)} · {savedDraft.readTime}</span>
                  </div>
                  <button type="button" onClick={() => editSavedDraft(savedDraft)}>打开编辑</button>
                </article>
              ))}
            </div>
            {draftArticles.length === 0 && (
              <div className="drafts-empty">
                <p>草稿箱还是空的。编辑文章时点「存回草稿箱」，内容就会作为本地 Markdown 保存在这里。</p>
              </div>
            )}
          </section>
        )}

        {view.name === "editor" && editorEnabled && recoveryGateStatus === "ready" && (
          <section className="editor-page">
            <div className="editor-topbar">
              <div>
                <p className="section-kicker">QUIET EDITOR</p>
                <h1>{draft.draftId ? "编辑草稿" : draft.articleId ? "编辑文章" : "写一篇新文章"}</h1>
              </div>
              <div className="editor-actions">
                {(draft.articleId || draft.draftId) && <button className="secondary-button" type="button" onClick={startNewDraft}>新建文章</button>}
                <button className="secondary-button" type="button" onClick={saveToDraftBox} disabled={savingDraft || savingMarkdown}>
                  {savingDraft ? "正在保存草稿…" : draft.draftId ? "存回草稿箱" : "保存到草稿箱"}
                </button>
                <button className="primary-button" type="button" onClick={saveMarkdownToProject} disabled={savingMarkdown}>
                  {savingMarkdown ? "构建、提交并推送中…" : draft.articleId ? "正式保存修改" : "正式保存并发布"}
                </button>
              </div>
            </div>
            <p className={`editor-tip${autosaveFailed ? " autosave-failed" : ""}`}>
              草稿以 content/drafts 中的本地 Markdown 为准；正式保存会写入 content/posts，通过静态构建后提交并推送到 main。
              <span>{autosaveNotice}</span>
            </p>
            <div className="editor-meta">
              <label className="title-field">
                <span>标题</span>
                <textarea
                  className="title-input"
                  value={draft.title}
                  onChange={(event) => setDraft({ ...draft, title: event.target.value })}
                  placeholder="给这篇文章一个名字"
                  rows={2}
                />
              </label>
              <label>
                <span>Slug（文章地址）</span>
                <input value={draft.slug} onChange={(event) => setDraft({ ...draft, slug: normalizeSlug(event.target.value) })} placeholder="留空则根据标题生成" disabled={Boolean(draft.articleId || draft.draftId)} />
                {slugDiffersFromTitle && (
                  <small className="slug-hint">标题与 Slug 不同：文章列表将显示标题，链接将继续使用此 Slug。</small>
                )}
              </label>
              <div className="editor-meta-side">
                <label>
                  <span>分类</span>
                  <input value={draft.category} onChange={(event) => setDraft({ ...draft, category: event.target.value })} placeholder="评论" />
                </label>
                <AiParticipationSlider
                  value={draft.aiParticipation}
                  onChange={(aiParticipation) => setDraft({ ...draft, aiParticipation })}
                />
              </div>
              <label className="excerpt-field">
                <span className="excerpt-label">
                  <span>摘要</span>
                  {localAiEnabled && (
                    <button type="button" onClick={summarizeDraft} disabled={summarizing}>
                      {summarizing ? "正在总结…" : "AI 智能总结"}
                    </button>
                  )}
                </span>
                <textarea
                  value={draft.excerpt}
                  onChange={(event) => setDraft({ ...draft, excerpt: event.target.value })}
                  placeholder="用一小段话介绍这篇文章（可选）"
                  rows={4}
                />
              </label>
            </div>
            {proofreadingSuggestions && (
              <section className="proofreading-panel" aria-live="polite">
                <div className="proofreading-heading">
                  <div>
                    <p className="section-kicker">AI PROOFREADING</p>
                    <h2>文字检查建议</h2>
                  </div>
                  <button type="button" onClick={() => setProofreadingSuggestions("")} aria-label="关闭文字检查建议">关闭</button>
                </div>
                <Markdown source={proofreadingSuggestions} />
                <p className="proofreading-note">检查结果仅供参考，不会自动改动正文。</p>
              </section>
            )}
            <div className="editor-workspace">
              <section className="writing-pane">
                <div className="writing-toolbar">
                  <span className="pane-label">MARKDOWN</span>
                  <div className="writing-tools">
                    {localAiEnabled && (
                      <button
                        type="button"
                        onClick={proofreadDraft}
                        disabled={proofreading}
                        title="只给修改建议，不会改动正文"
                      >
                        {proofreading ? "正在检查…" : "AI 检查语病与错别字"}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => imageInputRef.current?.click()}
                      disabled={uploadingImage}
                    >
                      {uploadingImage ? "正在保存图片…" : "＋ 插入图片"}
                    </button>
                  </div>
                  <input
                    ref={imageInputRef}
                    className="visually-hidden"
                    type="file"
                    accept="image/png,image/jpeg,image/gif,image/webp,image/avif"
                    aria-label="选择要插入的图片"
                    onChange={(event) => {
                      const file = event.currentTarget.files?.[0];
                      event.currentTarget.value = "";
                      if (file) void uploadImage(file);
                    }}
                  />
                </div>
                <textarea
                  ref={markdownTextareaRef}
                  value={draft.content}
                  onChange={(event) => {
                    setDraft({ ...draft, content: event.target.value });
                    setProofreadingSuggestions("");
                  }}
                  placeholder="从这里开始写下今天的想法……"
                  aria-label="Markdown 正文"
                  spellCheck="true"
                />
              </section>
              <section className="preview-pane" aria-label="文章实时预览">
                <span className="pane-label">PREVIEW</span>
                <article>
                  <p className="article-category">{draft.category || "未分类"}</p>
                  <h1>{draft.title || "未命名的文章"}</h1>
                  <div className="article-meta">
                    <span>{draft.originalDate || formatDate(new Date())} · {formatWordCount(draft.content)} · {readTime(draft.content)}</span>
                    <AiParticipationIndicator value={draft.aiParticipation} variant="label" />
                  </div>
                  <Markdown source={draft.content} />
                </article>
              </section>
            </div>
          </section>
        )}


<div className={`toast ${toast ? "show" : ""}`} role="status" aria-live="polite">{toast}</div>
</>;
}

function AiParticipationSlider({ value, onChange }: { value: AiParticipationLevel; onChange: (value: AiParticipationLevel) => void }) {
  const sliderValue = value - 1;
  const label = AI_PARTICIPATION_LABELS[value - 1];
  const sliderStyle = { "--ai-progress": `${sliderValue * 25}%` } as CSSProperties;

  return (
    <fieldset className="ai-participation-field">
      <legend className="visually-hidden">AI 参与度</legend>
      <div className="ai-participation-heading">
        <span>AI 参与度</span>
        <strong>{label}</strong>
      </div>
      <div className="ai-slider-control">
        <input
          type="range"
          min="0"
          max="4"
          step="1"
          value={sliderValue}
          aria-label="AI 参与度"
          aria-valuetext={label}
          style={sliderStyle}
          onChange={(event) => onChange((Number(event.target.value) + 1) as AiParticipationLevel)}
        />
        <div className="ai-slider-ticks" aria-hidden="true">
          {AI_PARTICIPATION_LABELS.map((tickLabel) => <span key={tickLabel} />)}
        </div>
      </div>
    </fieldset>
  );
}
