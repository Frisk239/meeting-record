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

const LB_MIN_ZOOM = 0.4;
const LB_MAX_ZOOM = 4;
const LB_ZOOM_STEP = 1.25;

function clampZoom(z: number): number {
  return Math.min(LB_MAX_ZOOM, Math.max(LB_MIN_ZOOM, z));
}

/**
 * Lightbox with real zoom + pan:
 * - toolbar 放大 / 缩小 / 适配
 * - 滚轮缩放（相对指针）
 * - 拖拽平移
 * - 双击：在「适配」与「2× 适配」之间切换
 * - Esc 关闭；+/-/0 快捷键
 */
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
  const [fitZoom, setFitZoom] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [boardH, setBoardH] = useState(480);
  const dragRef = useRef<{
    active: boolean;
    startX: number;
    startY: number;
    origX: number;
    origY: number;
  } | null>(null);
  const [dragging, setDragging] = useState(false);

  const recomputeFit = useCallback(() => {
    const stage = stageRef.current;
    if (!stage) return 1;
    const pad = 32;
    const availW = Math.max(160, stage.clientWidth - pad);
    const availH = Math.max(160, stage.clientHeight - pad);
    const art = stage.querySelector(".vb-artboard") as HTMLElement | null;
    const naturalH = art?.offsetHeight || boardH || 480;
    if (art?.offsetHeight) setBoardH(art.offsetHeight);
    const byW = availW / VISUAL_ARTBOARD_WIDTH;
    const byH = availH / Math.max(1, naturalH);
    // Fit entirely in view; may be < 1 on phones
    return clampZoom(Math.min(byW, byH, 1.25));
  }, [boardH]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (e.key === "+" || e.key === "=") {
        e.preventDefault();
        setZoom((z) => clampZoom(z * LB_ZOOM_STEP));
      } else if (e.key === "-" || e.key === "_") {
        e.preventDefault();
        setZoom((z) => clampZoom(z / LB_ZOOM_STEP));
      } else if (e.key === "0") {
        e.preventDefault();
        const fit = recomputeFit();
        setFitZoom(fit);
        setZoom(fit);
        setPan({ x: 0, y: 0 });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose, recomputeFit]);

  // Initial fit when opening / board changes
  useEffect(() => {
    if (!open) return;
    const stage = stageRef.current;
    if (!stage) return;

    const applyFit = () => {
      const fit = recomputeFit();
      setFitZoom(fit);
      setZoom(fit);
      setPan({ x: 0, y: 0 });
    };

    applyFit();
    const ro = new ResizeObserver(() => {
      // Keep relative zoom vs fit when stage resizes
      const nextFit = recomputeFit();
      setFitZoom((prevFit) => {
        setZoom((z) => {
          const rel = prevFit > 0 ? z / prevFit : 1;
          return clampZoom(nextFit * rel);
        });
        return nextFit;
      });
    });
    ro.observe(stage);
    const t1 = window.setTimeout(applyFit, 40);
    const t2 = window.setTimeout(applyFit, 200);
    return () => {
      ro.disconnect();
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [open, board, recomputeFit]);

  const zoomBy = useCallback((factor: number, center?: { x: number; y: number }) => {
    setZoom((prev) => {
      const next = clampZoom(prev * factor);
      if (center && stageRef.current) {
        const rect = stageRef.current.getBoundingClientRect();
        const cx = center.x - rect.left - rect.width / 2;
        const cy = center.y - rect.top - rect.height / 2;
        // Keep point under cursor stable-ish
        setPan((p) => ({
          x: cx - ((cx - p.x) * next) / prev,
          y: cy - ((cy - p.y) * next) / prev,
        }));
      }
      return next;
    });
  }, []);

  const zoomIn = () => zoomBy(LB_ZOOM_STEP);
  const zoomOut = () => zoomBy(1 / LB_ZOOM_STEP);
  const zoomFit = () => {
    const fit = recomputeFit();
    setFitZoom(fit);
    setZoom(fit);
    setPan({ x: 0, y: 0 });
  };
  const zoom100 = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const factor = e.deltaY > 0 ? 1 / LB_ZOOM_STEP : LB_ZOOM_STEP;
    zoomBy(factor, { x: e.clientX, y: e.clientY });
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    // Always allow pan; even at fit zoom small nudges help
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = {
      active: true,
      startX: e.clientX,
      startY: e.clientY,
      origX: pan.x,
      origY: pan.y,
    };
    setDragging(true);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d?.active) return;
    setPan({
      x: d.origX + (e.clientX - d.startX),
      y: d.origY + (e.clientY - d.startY),
    });
  };

  const endDrag = (e: React.PointerEvent) => {
    if (dragRef.current?.active) {
      try {
        (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
      } catch {
        // ignore
      }
    }
    dragRef.current = null;
    setDragging(false);
  };

  const onDoubleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    // Toggle fit ↔ 2× fit (local magnify)
    if (Math.abs(zoom - fitZoom) < 0.05) {
      zoomBy(2, { x: e.clientX, y: e.clientY });
    } else {
      zoomFit();
    }
  };

  if (!open || typeof document === "undefined") return null;

  const pct = Math.round(zoom * 100);
  const scaledW = VISUAL_ARTBOARD_WIDTH * zoom;
  const scaledH = boardH * zoom;

  return createPortal(
    <div
      className="vb-lightbox"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onClick={onClose}
    >
      <div className="vb-lightbox-panel" onClick={(e) => e.stopPropagation()}>
        <div className="vb-lightbox-bar">
          <h3 id={titleId} className="vb-lightbox-title">
            图解预览
          </h3>
          <div className="vb-lightbox-actions">
            <div className="vb-zoom-group" role="group" aria-label="缩放">
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={zoomOut}
                disabled={zoom <= LB_MIN_ZOOM + 0.001}
                title="缩小（-）"
              >
                −
              </button>
              <span className="vb-zoom-label" title="当前缩放">
                {pct}%
              </span>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={zoomIn}
                disabled={zoom >= LB_MAX_ZOOM - 0.001}
                title="放大（+）"
              >
                +
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={zoomFit}
                title="适配窗口（0）"
              >
                适配
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={zoom100}
                title="原始 100%"
              >
                1:1
              </button>
            </div>
            {onDownload ? (
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                disabled={Boolean(downloadBusy)}
                onClick={() => {
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
            <button type="button" className="btn btn-primary btn-sm" onClick={onClose}>
              关闭
            </button>
          </div>
        </div>

        <div
          ref={stageRef}
          className={`vb-lightbox-stage${dragging ? " is-dragging" : ""}${zoom > fitZoom + 0.02 ? " is-zoomed" : ""}`}
          onWheel={onWheel}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onDoubleClick={onDoubleClick}
        >
          <div
            className="vb-lightbox-canvas"
            style={{
              width: scaledW,
              height: scaledH,
              transform: `translate(${pan.x}px, ${pan.y}px)`,
            }}
          >
            <div
              className="vb-lightbox-art-wrap"
              style={{
                width: VISUAL_ARTBOARD_WIDTH,
                height: boardH,
                transform: `scale(${zoom})`,
                transformOrigin: "top left",
              }}
            >
              <MinutesVisualArtboard board={board} artboardRef={lightboxArtRef} />
            </div>
          </div>
        </div>

        <p className="muted caption vb-lightbox-hint">
          滚轮缩放 · 拖拽平移 · 双击放大/适配 · Esc 关闭
        </p>
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
          title="放大图解"
          aria-label="放大图解"
        >
          <MinutesVisualBoard board={board!} artboardRef={artboardRef} />
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
        title="放大图解"
        aria-label="放大图解"
      >
        <MinutesVisualBoard board={board} />
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
