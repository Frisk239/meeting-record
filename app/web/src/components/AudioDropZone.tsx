import { useCallback, useState, type DragEvent, type ReactNode } from "react";

const AUDIO_EXT = /\.(mp3|wav|m4a|aac|ogg|flac|webm|mp4|mpeg|mpga)$/i;

function isLikelyAudio(file: File): boolean {
  if (file.type.startsWith("audio/") || file.type === "video/webm" || file.type === "video/mp4") {
    return true;
  }
  return AUDIO_EXT.test(file.name);
}

function pickAudioFile(list: FileList | DataTransferItemList | null): File | null {
  if (!list || list.length === 0) return null;
  // FileList
  if ("item" in list && typeof (list as FileList).item === "function" && "length" in list) {
    const files = list as FileList;
    for (let i = 0; i < files.length; i++) {
      const f = files.item(i);
      if (f && isLikelyAudio(f)) return f;
    }
    return files.item(0);
  }
  return null;
}

type Props = {
  disabled?: boolean;
  /** Compact strip (detail page) vs large empty-state zone */
  compact?: boolean;
  className?: string;
  onFile: (file: File) => void;
  children?: ReactNode;
  label?: string;
  hint?: string;
};

/**
 * Desktop drag-and-drop target for audio import. Also clickable via children actions.
 */
export function AudioDropZone({
  disabled,
  compact,
  className = "",
  onFile,
  children,
  label = "拖拽音频到这里",
  hint = "支持 wav / mp3 / m4a / webm 等 · 也可点「导入音频」",
}: Props) {
  const [over, setOver] = useState(false);

  const onDragEnter = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (disabled) return;
    setOver(true);
  }, [disabled]);

  const onDragOver = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (disabled) return;
    e.dataTransfer.dropEffect = "copy";
    setOver(true);
  }, [disabled]);

  const onDragLeave = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    // only clear when leaving the zone itself
    if (e.currentTarget === e.target || !e.currentTarget.contains(e.relatedTarget as Node)) {
      setOver(false);
    }
  }, []);

  const onDrop = useCallback(
    (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setOver(false);
      if (disabled) return;
      const file =
        pickAudioFile(e.dataTransfer.files) ||
        (() => {
          for (const item of Array.from(e.dataTransfer.items || [])) {
            if (item.kind === "file") {
              const f = item.getAsFile();
              if (f && isLikelyAudio(f)) return f;
            }
          }
          return null;
        })();
      if (file) onFile(file);
    },
    [disabled, onFile],
  );

  return (
    <div
      className={`drop-zone ${compact ? "drop-zone-compact" : ""} ${over ? "drop-zone-over" : ""} ${
        disabled ? "drop-zone-disabled" : ""
      } ${className}`.trim()}
      onDragEnter={onDragEnter}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      data-testid="audio-drop-zone"
    >
      {children}
      <div className="drop-zone-hint" aria-hidden={!over && compact}>
        <span className="drop-zone-title">{over ? "松开即可上传" : label}</span>
        {!compact ? <span className="drop-zone-sub muted">{hint}</span> : null}
      </div>
    </div>
  );
}
