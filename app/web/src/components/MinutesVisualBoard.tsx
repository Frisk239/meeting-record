import type { VisualBoard, VisualCard, VisualSection } from "../api";

const ICON: Record<string, string> = {
  doc: "📄",
  clock: "⏱",
  people: "👥",
  flag: "🚩",
  check: "✅",
  alert: "⚠️",
  shield: "🛡",
  target: "🎯",
  calendar: "📅",
  link: "🔗",
  star: "⭐",
  bolt: "⚡",
  folder: "📁",
  chat: "💬",
};

function iconOf(name?: string): string {
  if (!name) return "•";
  return ICON[name] || "•";
}

function CardView({ card, className = "" }: { card: VisualCard; className?: string }) {
  const tone = card.tone || "neutral";
  return (
    <div className={`vb-card tone-${tone} ${className}`.trim()}>
      <div className="vb-card-head">
        <span className="vb-card-icon" aria-hidden>
          {iconOf(card.icon)}
        </span>
        <div className="vb-card-titles">
          <h5 className="vb-card-title">{card.title}</h5>
          {card.badge ? <span className="vb-badge">{card.badge}</span> : null}
        </div>
      </div>
      {card.body ? <p className="vb-card-body">{card.body}</p> : null}
      {card.bullets?.length ? (
        <ul className="vb-bullets">
          {card.bullets.map((b, i) => (
            <li key={i}>{b}</li>
          ))}
        </ul>
      ) : null}
      {card.footer ? <p className="vb-card-footer">{card.footer}</p> : null}
    </div>
  );
}

function SectionView({ section }: { section: VisualSection }) {
  if (section.type === "hero") {
    return (
      <header className="vb-hero">
        <h3 className="vb-hero-title">{section.title}</h3>
        {section.subtitle ? <p className="vb-hero-sub">{section.subtitle}</p> : null}
      </header>
    );
  }

  if (section.type === "stage_row") {
    return (
      <section className="vb-section">
        <h4 className="vb-section-h">{section.heading}</h4>
        <div className="vb-stage-row">
          {section.items.map((it, i) => (
            <div key={i} className={`vb-stage-item tone-${it.tone || "teal"}`}>
              <div className="vb-stage-top">
                <span className="vb-stage-dot" aria-hidden>
                  {iconOf(it.icon)}
                </span>
                {i < section.items.length - 1 ? <span className="vb-stage-line" /> : null}
              </div>
              <div className="vb-stage-title-row">
                <strong>{it.title}</strong>
                {it.badge ? <span className="vb-badge">{it.badge}</span> : null}
              </div>
              <p className="vb-stage-body">{it.body}</p>
            </div>
          ))}
        </div>
      </section>
    );
  }

  if (section.type === "compare_cards") {
    return (
      <section className="vb-section">
        <h4 className="vb-section-h">{section.heading}</h4>
        <div className="vb-compare">
          {section.cards.map((c, i) => (
            <CardView key={i} card={c} />
          ))}
        </div>
      </section>
    );
  }

  if (section.type === "card_grid") {
    return (
      <section className="vb-section">
        <h4 className="vb-section-h">{section.heading}</h4>
        <div className={`vb-grid cols-${section.columns}`}>
          {section.cards.map((c, i) => (
            <CardView key={i} card={c} />
          ))}
        </div>
      </section>
    );
  }

  if (section.type === "action_board") {
    return (
      <section className="vb-section">
        <h4 className="vb-section-h">{section.heading}</h4>
        <ul className="vb-actions">
          {section.items.map((it, i) => (
            <li key={i}>
              <span className="vb-action-owner">{it.owner || "未指定"}</span>
              <span className="vb-action-text">{it.action}</span>
              {it.due ? <span className="vb-action-due">{it.due}</span> : null}
            </li>
          ))}
        </ul>
      </section>
    );
  }

  if (section.type === "callout") {
    return (
      <div className={`vb-callout tone-${section.tone}`}>
        <span className="vb-callout-mark" aria-hidden>
          {section.tone === "warn" ? "⚠" : section.tone === "info" ? "ℹ" : "★"}
        </span>
        <p>{section.text}</p>
      </div>
    );
  }

  return null;
}

export function MinutesVisualBoard({ board }: { board: VisualBoard }) {
  return (
    <div className="vb-board">
      <div className="vb-board-label">
        <span>图解总览</span>
        {board.intent ? <span className="vb-intent muted caption">{board.intent}</span> : null}
      </div>
      {board.subtitle ? <p className="vb-subtitle-banner">{board.subtitle}</p> : null}
      {board.sections.map((s, i) => (
        <SectionView key={i} section={s} />
      ))}
    </div>
  );
}

/** Empty / loading slot reserved on minutes page. Never auto-generates. */
export function MinutesVisualSlot({
  board,
  loading,
  error,
  onGenerate,
  disabled,
  hasMinutes,
}: {
  board: VisualBoard | null | undefined;
  loading: boolean;
  error: string | null;
  /** Explicit user click only — first generate or regenerate. */
  onGenerate: () => void;
  disabled: boolean;
  hasMinutes: boolean;
}) {
  const hasBoard = Boolean(board && board.sections?.length);
  const canRun = !disabled && !loading && hasMinutes;

  return (
    <div className="vb-slot">
      <div className="vb-slot-toolbar">
        <div>
          <h3 className="vb-slot-title">图解总览</h3>
          <p className="muted caption">
            仅手动生成 · 不会在转写/纪要后自动生成
          </p>
        </div>
        <div className="vb-slot-actions">
          <button
            type="button"
            className={`btn btn-sm ${hasBoard ? "btn-ghost" : "btn-primary"}`}
            disabled={!canRun}
            onClick={onGenerate}
            title={
              !hasMinutes
                ? "请先生成纪要"
                : hasBoard
                  ? "再生成一版图解（会覆盖当前）"
                  : "根据当前纪要生成图解（需 LLM）"
            }
          >
            {loading && !hasBoard ? "生成中…" : "生成图解"}
          </button>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            disabled={!canRun || !hasBoard}
            onClick={onGenerate}
            title={
              !hasBoard
                ? "请先生成图解"
                : "不满意当前图解时，重新生成一版（会覆盖）"
            }
          >
            {loading && hasBoard ? "生成中…" : "重新生成图解"}
          </button>
        </div>
      </div>

      {error ? <p className="form-error vb-slot-error">{error}</p> : null}

      {loading ? (
        <div className="vb-skeleton" aria-busy="true">
          <div className="vb-skel-line w60" />
          <div className="vb-skel-row">
            <div className="vb-skel-card" />
            <div className="vb-skel-card" />
            <div className="vb-skel-card" />
          </div>
          <div className="vb-skel-row">
            <div className="vb-skel-card tall" />
            <div className="vb-skel-card tall" />
          </div>
          <p className="muted caption">正在调用模型生成图解…</p>
        </div>
      ) : hasBoard ? (
        <MinutesVisualBoard board={board!} />
      ) : (
        <div className="vb-placeholder">
          <div className="vb-placeholder-art" aria-hidden>
            <span />
            <span />
            <span />
          </div>
          <p className="vb-placeholder-title">此处将展示图解总览</p>
          <p className="muted caption">
            {hasMinutes
              ? "点击右上角「生成图解」后才会生成；不会自动生成。需已配置 LLM。"
              : "请先生成纪要，再生成图解。"}
          </p>
        </div>
      )}
    </div>
  );
}
