export const AI_PARTICIPATION_LABELS = ["纯人工", "AI辅助", "AI协作", "人类辅助", "纯AI"] as const;
type AiParticipationLevel = 1 | 2 | 3 | 4 | 5;
export function PageIntro({ label, title, text }: { label: string; title: string; text: string }) {
  return (
    <header className="page-intro">
      <p className="section-kicker">{label}</p>
      <h1>{title}</h1>
      <p>{text}</p>
    </header>
  );
}

function aiParticipationLabel(value: AiParticipationLevel) {
  return AI_PARTICIPATION_LABELS[value - 1];
}

export function AiParticipationIndicator({ value, variant }: { value: AiParticipationLevel; variant: "dots" | "label" }) {
  const label = aiParticipationLabel(value);
  return (
    <span
      className={`ai-participation-indicator ai-participation-indicator--${variant}`}
      aria-label={`AI 参与度：${label}`}
      title={`AI 参与度：${label}`}
    >
      {AI_PARTICIPATION_LABELS.map((dotLabel, index) => {
        const active = index + 1 === value;
        if (active && variant === "label") {
          return <span className="ai-participation-label" key={dotLabel}>{dotLabel}</span>;
        }

        return (
          <span
            aria-hidden="true"
            className={`ai-participation-dot${active ? " active" : ""}`}
            key={dotLabel}
          />
        );
      })}
    </span>
  );
}
