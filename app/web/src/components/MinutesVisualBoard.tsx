/**
 * Scheme A: fixed-width artboard (no mobile reflow into a long list),
 * SVG icons (no emoji), scale-to-fit, PNG download via html-to-image.
 */
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { toPng } from "html-to-image";
import type { VisualBoard, VisualCard, VisualSection } from "../api";
import { VisualIconSvg } from "./VisualIcons";

export const VISUAL_ARTBOARD_WIDTH = 720;

function CardView({ card, className = "" }: { card: VisualCard; className?: string }) {
  const tone = card.tone || "neutral";
  return (
    <div className={`vb-card tone-${tone} ${className}`.trim()}>
      <div className="vb-card-head">
        <span className="vb-card-icon-wrap" aria-hidden>
          <VisualIconSvg name={card.icon} />
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
    const n = Math.max(2, Math.min(4, section.items.length || 2));
    return (
      <section className="vb-section">
        <h4 className="vb-section-h">{section.heading}</h4>
        <div className={`vb-stage-row cols-${n}`}>
          {section.items.map((it, i) => (
            <div key={i} className={`vb-stage-item tone-${it.tone || "teal"}`}>
              <div className="vb-stage-top">
                <span className="vb-stage-dot" aria-hidden>
                  <VisualIconSvg name={it.icon || "doc"} />
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
        <div className={`vb-compare cols-${Math.min(3, Math.max(2, section.cards.length))}`}>
          {section.cards.map((c, i) => (
            <CardView key={i} card={c} />
          ))}
        </div>
      </section>
    );
  }

  if (section.type === "card_grid") {
    const cols = section.columns || 3;
    return (
      <section className="vb-section">
        <h4 className="vb-section-h">{section.heading}</h4>
        <div className={`vb-grid cols-${cols}`}>
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
          <VisualIconSvg
            name={section.tone === "warn" ? "alert" : section.tone === "info" ? "chat" : "star"}
          />
        </span>
        <p>{section.text}</p>
      </div>
    );
  }

  return null;
}

/** Fixed-width poster board (does not reflow columns on narrow screens). */
export function MinutesVisualArtboard({
  board,
  artboardRef,
}: {
  board: VisualBoard;
  artboardRef?: React.RefObject<HTMLDivElement | null>;
}) {
  return (
    <div
      ref={artboardRef}
      className="vb-artboard"
      style={{ width: VISUAL_ARTBOARD_WIDTH }}
      data-visual-artboard="1"
    >
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

/** Scale artboard to container; keep 720px layout proportions (never reflow columns). */
export function MinutesVisualBoard({
  board,
  artboardRef,
}: {
  board: VisualBoard;
  artboardRef?: React.RefObject<HTMLDivElement | null>;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [boardH, setBoardH] = useState(400);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const measure = () => {
      const w = host.clientWidth || VISUAL_ARTBOARD_WIDTH;
      // Always keep aspect: shrink whole poster to fit width, never grow past 1
      const s = Math.min(1, Math.max(0.35, w / VISUAL_ARTBOARD_WIDTH));
      setScale(s);
      const art = host.querySelector(".vb-artboard") as HTMLElement | null;
      const h = art?.offsetHeight || innerRef.current?.offsetHeight || 400;
      setBoardH(h);
    };

    measure();
    const ro = new ResizeObserver(() => measure());
    ro.observe(host);
    const art = host.querySelector(".vb-artboard");
    if (art) ro.observe(art);
    const t1 = window.setTimeout(measure, 30);
    const t2 = window.setTimeout(measure, 200);
    return () => {
      ro.disconnect();
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [board]);

  return (
    <div
      ref={hostRef}
      className="vb-scale-host"
      style={{ height: Math.ceil(boardH * scale) }}
    >
      <div
        ref={innerRef}
        className="vb-scale-inner"
        style={{
          width: VISUAL_ARTBOARD_WIDTH,
          transform: `scale(${scale})`,
          transformOrigin: "top left",
        }}
      >
        <MinutesVisualArtboard board={board} artboardRef={artboardRef} />
      </div>
    </div>
  );
}

export async function downloadVisualBoardPng(
  node: HTMLElement,
  filename: string,
): Promise<void> {
  const dataUrl = await toPng(node, {
    cacheBust: true,
    pixelRatio: 2,
    backgroundColor: "#faf9f5",
    width: VISUAL_ARTBOARD_WIDTH,
    style: {
      transform: "none",
      width: `${VISUAL_ARTBOARD_WIDTH}px`,
    },
  });
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = filename.endsWith(".png") ? filename : `${filename}.png`;
  a.click();
}

/** Fullscreen lightbox: show artboard near full width while keeping 720 layout. */
function VisualBoardLightbox({
  board,
  open,
  onClose,
  onDownload,
  downloadBusy,
}: {
  board: VisualBoard;
  open: boolean;
  onClose: () => void;
  onDownload?: () => void;
  downloadBusy?: boolean;
}) {
  const titleId = useId();
  const lightboxArtRef = useRef<HTMLDivElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    const stage = stageRef.current;
    if (!stage) return;

    const measure = () => {
      const pad = 24;
      const availW = Math.max(200, stage.clientWidth - pad);
      const availH = Math.max(200, stage.clientHeight - pad);
      const art = stage.querySelector(".vb-artboard") as HTMLElement | null;
      const naturalH = art?.offsetHeight || 480;
      const byW = availW / VISUAL_ARTBOARD_WIDTH;
      const byH = availH / naturalH;
      // Allow slight upscale on large monitors so "放大" feels larger than inline card
      setScale(Math.min(1.35, Math.max(0.4, Math.min(byW, byH))));
    };

    measure();
    const ro = new ResizeObserver(() => measure());
    ro.observe(stage);
    const t = window.setTimeout(measure, 40);
    return () => {
      ro.disconnect();
      window.clearTimeout(t);
    };
  }, [open, board]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="vb-lightbox"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onClick={onClose}
    >
      <div
        className="vb-lightbox-panel"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="vb-lightbox-bar">
          <h3 id={titleId} className="vb-lightbox-title">
            图解预览
          </h3>
          <div className="vb-lightbox-actions">
            {onDownload ? (
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                disabled={Boolean(downloadBusy)}
                onClick={() => {
                  // Prefer lightbox artboard node for crisp export if present
                  const node = lightboxArtRef.current;
                  if (node) {
                    void downloadVisualBoardPng(
                      node,
                      `图解-${(board.title || "visual").slice(0, 40)}`,
                    );
                  } else {
                    onDownload();
                  }
                }}
              >
                {downloadBusy ? "导出中…" : "下载 PNG"}
              </button>
            ) : null}
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={onClose}
            >
              关闭
            </button>
          </div>
        </div>
        <div ref={stageRef} className="vb-lightbox-stage">
          <div
            className="vb-lightbox-scale"
            style={{
              width: VISUAL_ARTBOARD_WIDTH * scale,
              height: "auto",
            }}
          >
            <div
              style={{
                width: VISUAL_ARTBOARD_WIDTH,
                transform: `scale(${scale})`,
                transformOrigin: "top left",
              }}
            >
              <MinutesVisualArtboard board={board} artboardRef={lightboxArtRef} />
            </div>
          </div>
        </div>
        <p className="muted caption vb-lightbox-hint">点击遮罩或按 Esc 关闭</p>
      </div>
    </div>,
    document.body,
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
  artboardRef,
  onDownload,
  downloadBusy,
}: {
  board: VisualBoard | null | undefined;
  loading: boolean;
  error: string | null;
  onGenerate: () => void;
  disabled: boolean;
  hasMinutes: boolean;
  artboardRef?: React.RefObject<HTMLDivElement | null>;
  onDownload?: () => void;
  downloadBusy?: boolean;
}) {
  const hasBoard = Boolean(board && board.sections?.length);
  const canRun = !disabled && !loading && hasMinutes;
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const openLightbox = useCallback(() => setLightboxOpen(true), []);
  const closeLightbox = useCallback(() => setLightboxOpen(false), []);

  return (
    <div className="vb-slot">
      <div className="vb-slot-toolbar">
        <div>
          <h3 className="vb-slot-title">图解总览</h3>
          <p className="muted caption">
            固定 720 画板 · 等比缩放 · 点击图解可放大
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
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            disabled={!hasBoard || loading}
            onClick={openLightbox}
            title={!hasBoard ? "请先生成图解" : "放大查看图解"}
          >
            放大
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            disabled={!hasBoard || Boolean(downloadBusy) || loading}
            onClick={onDownload}
            title={!hasBoard ? "请先生成图解" : "下载图解 PNG"}
          >
            {downloadBusy ? "导出中…" : "下载图解"}
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
        <button
          type="button"
          className="vb-open-hit"
          onClick={openLightbox}
          title="点击放大图解"
        >
          <MinutesVisualBoard board={board!} artboardRef={artboardRef} />
          <span className="vb-open-hint">点击放大</span>
        </button>
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
              ? "点击「生成图解」后以固定画板展示；手机端整体缩放，不拆成单列清单。"
              : "请先生成纪要，再生成图解。"}
          </p>
        </div>
      )}

      {hasBoard ? (
        <VisualBoardLightbox
          board={board!}
          open={lightboxOpen}
          onClose={closeLightbox}
          onDownload={onDownload}
          downloadBusy={downloadBusy}
        />
      ) : null}
    </div>
  );
}

export function VisualBoardReadonly({
  board,
  footer,
}: {
  board: VisualBoard;
  footer?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="vb-slot vb-slot-readonly">
      <button
        type="button"
        className="vb-open-hit"
        onClick={() => setOpen(true)}
        title="点击放大图解"
      >
        <MinutesVisualBoard board={board} />
        <span className="vb-open-hint">点击放大</span>
      </button>
      <VisualBoardLightbox
        board={board}
        open={open}
        onClose={() => setOpen(false)}
      />
      {footer}
    </div>
  );
}
