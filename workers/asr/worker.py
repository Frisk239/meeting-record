#!/usr/bin/env python3
"""
Meeting Record — FunASR CPU transcription sidecar.

Pipeline (ADR 0004): SenseVoiceSmall + fsmn-vad + cam++ on device=cpu.
Protocol: CLI JSON out, or one JSON object per stdin line.

  python worker.py --audio /path/to.wav
  echo '{"audio":"...","request_id":"1"}' | python worker.py --serve

Exit 0 + JSON on stdout. Errors: exit 2 + JSON {"status":"failed",...}.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
import traceback
from pathlib import Path
from typing import Any

# Reduce thread oversubscription on 4C boxes
os.environ.setdefault("OMP_NUM_THREADS", "4")
os.environ.setdefault("MKL_NUM_THREADS", "4")
# Windows consoles default to GBK; without this, ensure_ascii=False Chinese
# becomes GBK bytes on stdout and Node decodes them as UTF-8 → permanent U+FFFD.
os.environ.setdefault("PYTHONIOENCODING", "utf-8")
os.environ.setdefault("PYTHONUTF8", "1")


def _force_utf8_stdio() -> None:
    """Make JSON on stdout always UTF-8 bytes, independent of console code page."""
    for stream in (sys.stdout, sys.stderr):
        try:
            stream.reconfigure(encoding="utf-8", errors="replace")  # type: ignore[attr-defined]
        except Exception:
            pass


_force_utf8_stdio()

_MODEL = None
_MODEL_KEY: str | None = None
_PATCHED = False


def log(msg: str) -> None:
    print(msg, file=sys.stderr, flush=True)


def emit_json(obj: Any) -> None:
    """Write one UTF-8 JSON object to stdout (protocol for Node FunasrEngine)."""
    payload = json.dumps(obj, ensure_ascii=False, separators=(",", ":"))
    data = (payload + "\n").encode("utf-8")
    try:
        sys.stdout.buffer.write(data)
        sys.stdout.buffer.flush()
    except Exception:
        # Fallback if buffer unavailable
        sys.stdout.write(payload + "\n")
        sys.stdout.flush()


def _ensure_patches() -> None:
    global _PATCHED
    if _PATCHED:
        return
    try:
        from funasr_patches import apply_funasr_patches

        apply_funasr_patches()
        _PATCHED = True
        log("[asr-worker] FunASR quality patch applied (timestamp_sentence None-safe)")
    except Exception as e:
        log(f"[asr-worker] FunASR patch failed (will still try): {e}")


def load_model(
    model_id: str,
    vad_model: str,
    spk_model: str | None,
    device: str,
    hub: str,
    punc_model: str | None = "ct-punc",
) -> Any:
    global _MODEL, _MODEL_KEY
    key = f"{model_id}|{vad_model}|{spk_model}|{punc_model}|{device}|{hub}"
    if _MODEL is not None and _MODEL_KEY == key:
        return _MODEL

    _ensure_patches()
    from funasr import AutoModel  # type: ignore

    kwargs: dict[str, Any] = {
        "model": model_id,
        "vad_model": vad_model,
        "device": device,
        "hub": hub,
        "disable_update": True,
        "ncpu": int(os.environ.get("ASR_NCPU", "4")),
    }
    if spk_model:
        kwargs["spk_model"] = spk_model
        # SenseVoice has no reliable char-level timestamps. FunASR may still set
        # output_timestamp and stay on punc_segment, which mis-aligns text vs
        # punc/timestamps and emits pure punctuation sentences for most of a
        # long meeting (Speaker 1/2 become "，" "。" "？"). Use vad_segment.
        model_l = (model_id or "").lower()
        spk_mode_env = (os.environ.get("FUNASR_SPK_MODE") or "").strip()
        if spk_mode_env in ("vad_segment", "punc_segment", "default"):
            kwargs["spk_mode"] = spk_mode_env
        elif "sensevoice" in model_l:
            kwargs["spk_mode"] = "vad_segment"
            log("[asr-worker] SenseVoice → spk_mode=vad_segment (avoid punc-only ghosts)")
        elif punc_model:
            kwargs["spk_mode"] = "punc_segment"
    if punc_model:
        kwargs["punc_model"] = punc_model

    log(f"[asr-worker] loading AutoModel {kwargs}")
    t0 = time.time()
    _MODEL = AutoModel(**kwargs)
    _MODEL_KEY = key
    log(f"[asr-worker] model ready in {time.time() - t0:.1f}s")
    return _MODEL


def _to_ms(x: Any) -> int:
    if x is None:
        return 0
    try:
        v = float(x)
    except (TypeError, ValueError):
        return 0
    # FunASR sentence_info / timestamps are usually milliseconds (e.g. 610, 5530).
    # Only treat as seconds when clearly sub-minute fractional/small (e.g. 1.23, 5.5).
    if 0 < v < 100 and (v != int(v) or v < 30):
        return int(round(v * 1000))
    return int(round(v))


def _clean_text(text: str) -> str:
    import re

    # SenseVoice language/emotion/event tags: <|zh|><|NEUTRAL|>...
    t = re.sub(r"<\|[^|>]+?\|>", "", text or "")
    return t.strip()


_PURE_PUNC_RE = None


def _is_pure_punc(text: str) -> bool:
    """True for empty / punctuation-only strings (ghost diarization segments)."""
    global _PURE_PUNC_RE
    import re

    t = (text or "").strip()
    if not t:
        return True
    if _PURE_PUNC_RE is None:
        # ，。？、；：… and common ASCII/CJK punctuation
        _PURE_PUNC_RE = re.compile(
            r"^[\s,.:;!?\-\u2014\u2026\u00B7"
            r"\uFF0C\u3002\uFF1F\u3001\uFF1B\uFF1A"
            r"\u201C\u201D\u2018\u2019\uFF08\uFF09"
            r"()\[\]\u3010\u3011\u300A\u300B<>\"']+$"
        )
    return bool(_PURE_PUNC_RE.fullmatch(t))


def _finalize_segments(segments: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Drop punctuation-only ghost segments.

    Real sentences already include their trailing ，。？ from timestamp_sentence.
    Pure-punc rows are alignment artifacts and must not create Speaker N chips.
    """
    cleaned: list[dict[str, Any]] = []
    for s in segments:
        text = str(s.get("text") or "").strip()
        if not text or _is_pure_punc(text):
            continue
        cleaned.append({**s, "text": text})
    return cleaned


def parse_funasr_result(raw: Any) -> list[dict[str, Any]]:
    """Normalize AutoModel.generate output → [{speaker,startMs,endMs,text}]."""
    if raw is None:
        return []
    if isinstance(raw, list) and raw and not isinstance(raw[0], dict):
        # unexpected
        raw = [{"text": str(x)} for x in raw]
    if isinstance(raw, dict):
        items = [raw]
    elif isinstance(raw, list):
        items = raw
    else:
        return [{"speaker": "Speaker 0", "startMs": 0, "endMs": 0, "text": str(raw)}]

    segments: list[dict[str, Any]] = []

    for item in items:
        if not isinstance(item, dict):
            segments.append(
                {
                    "speaker": "Speaker 0",
                    "startMs": 0,
                    "endMs": 0,
                    "text": str(item).strip(),
                }
            )
            continue

        # Prefer sentence_info (with spk) when diarization is on
        sentence_info = item.get("sentence_info") or item.get("sentence_info_list")
        if isinstance(sentence_info, list) and sentence_info:
            for s in sentence_info:
                if not isinstance(s, dict):
                    continue
                text = _clean_text(s.get("text") or s.get("sentence") or "")
                if not text:
                    continue
                spk = s.get("spk")
                if spk is None:
                    spk = s.get("speaker")
                if spk is None:
                    spk = 0
                try:
                    spk_i = int(spk)
                    speaker = f"Speaker {spk_i}"
                except (TypeError, ValueError):
                    speaker = f"Speaker {spk}" if str(spk).startswith("Speaker") else f"Speaker {spk}"
                start = s.get("start", s.get("start_time", s.get("bg", 0)))
                end = s.get("end", s.get("end_time", s.get("ed", start)))
                segments.append(
                    {
                        "speaker": speaker,
                        "startMs": _to_ms(start),
                        "endMs": _to_ms(end),
                        "text": text,
                    }
                )
            continue

        text = _clean_text(item.get("text") or "")
        if not text:
            continue
        ts = item.get("timestamp") or item.get("time_stamp")
        start_ms, end_ms = 0, 0
        if isinstance(ts, list) and ts:
            try:
                start_ms = _to_ms(ts[0][0] if isinstance(ts[0], (list, tuple)) else ts[0])
                last = ts[-1]
                end_ms = _to_ms(last[1] if isinstance(last, (list, tuple)) and len(last) > 1 else last)
            except Exception:
                pass
        segments.append(
            {
                "speaker": "Speaker 0",
                "startMs": start_ms,
                "endMs": end_ms,
                "text": text,
            }
        )

    return _finalize_segments([s for s in segments if s.get("text")])


def transcribe_file(
    audio: str,
    *,
    model_id: str,
    vad_model: str,
    spk_model: str | None,
    device: str,
    hub: str,
    batch_size_s: int,
    punc_model: str | None = "ct-punc",
) -> dict[str, Any]:
    from audio_io import prepare_for_funasr, progress

    path = Path(audio)
    if not path.is_file():
        return {
            "status": "failed",
            "engine": "funasr",
            "segments": [],
            "errorMessage": f"audio not found: {audio}",
        }

    # Always convert to short-path 16k mono wav (webm/mp3/m4a + Windows path safety)
    tmp_wav: Path | None = None
    try:
        progress("queued", 2, "准备转写")
        try:
            wav_path, is_temp = prepare_for_funasr(path)
            if is_temp:
                tmp_wav = wav_path
        except Exception as e:
            # Keep message UTF-8 / mostly English so Windows consoles and JSON stay readable
            msg = f"audio convert failed: {e}"
            return {
                "status": "failed",
                "engine": "funasr",
                "segments": [],
                "errorMessage": msg[:500],
                "trace": traceback.format_exc()[-2000:],
            }

        progress("loading_model", 25, "loading FunASR models")
        # Soft crawl while model loads (parent can also tick elapsed)
        try:
            model = load_model(model_id, vad_model, spk_model, device, hub, punc_model)
        except Exception as e:
            return {
                "status": "failed",
                "engine": "funasr",
                "segments": [],
                "errorMessage": f"model load failed: {e}",
                "trace": traceback.format_exc()[-2000:],
            }
        progress("loading_model", 48, "models ready")

        progress("transcribing", 52, "ASR+VAD+speaker running")
        try:
            import math
            import threading

            t0 = time.time()
            stop_hb = threading.Event()

            def _heartbeat() -> None:
                # Soft percent 52→88 while generate blocks (long meetings)
                while not stop_hb.wait(2.0):
                    elapsed_s = time.time() - t0
                    pct = min(
                        88.0,
                        52.0 + (88.0 - 52.0) * (1.0 - math.exp(-elapsed_s / 120.0)),
                    )
                    progress(
                        "transcribing",
                        int(pct),
                        f"inferring… {int(elapsed_s)}s elapsed",
                    )

            hb = threading.Thread(target=_heartbeat, daemon=True)
            hb.start()
            try:
                # Full quality: VAD+ASR+punc+cam++ (patches fix punc/timestamp None crash)
                raw = model.generate(
                    input=str(wav_path),
                    batch_size_s=batch_size_s,
                )
            finally:
                stop_hb.set()
                hb.join(timeout=1.0)

            elapsed = time.time() - t0
            progress("transcribing", 92, "parsing segments")
            segments = parse_funasr_result(raw)
            if not segments:
                # Last-resort: one segment from raw text if any
                try:
                    if isinstance(raw, list) and raw and isinstance(raw[0], dict):
                        t = _clean_text(str(raw[0].get("text") or ""))
                        if t:
                            segments = [
                                {
                                    "speaker": "Speaker 0",
                                    "startMs": 0,
                                    "endMs": 0,
                                    "text": t,
                                }
                            ]
                except Exception:
                    pass
            if not segments:
                return {
                    "status": "failed",
                    "engine": "funasr",
                    "segments": [],
                    "errorMessage": "empty ASR result",
                    "rawType": type(raw).__name__,
                    "elapsedSec": round(elapsed, 3),
                }
            progress("done", 100, f"done {len(segments)} segments in {elapsed:.1f}s")
            return {
                "status": "succeeded",
                "engine": "funasr",
                "segments": segments,
                "elapsedSec": round(elapsed, 3),
                "model": model_id,
                "vad": vad_model,
                "spk": spk_model or "",
            }
        except Exception as e:
            err = f"generate failed: {e}"
            log(f"[asr-worker] {err}")
            log(traceback.format_exc()[-1500:])
            return {
                "status": "failed",
                "engine": "funasr",
                "segments": [],
                "errorMessage": err[:500],
                "trace": traceback.format_exc()[-2000:],
            }
    finally:
        if tmp_wav is not None:
            try:
                tmp_wav.unlink(missing_ok=True)
            except Exception:
                pass


def main() -> int:
    p = argparse.ArgumentParser(description="FunASR CPU worker for meeting-record")
    p.add_argument("--audio", help="Path to audio file")
    p.add_argument("--serve", action="store_true", help="Read JSON lines from stdin")
    p.add_argument(
        "--model",
        default=os.environ.get("FUNASR_MODEL", "iic/SenseVoiceSmall"),
        help="ASR model id",
    )
    p.add_argument(
        "--vad",
        default=os.environ.get("FUNASR_VAD", "fsmn-vad"),
        help="VAD model id",
    )
    p.add_argument(
        "--spk",
        default=os.environ.get("FUNASR_SPK", "cam++"),
        help="Speaker model id; empty string disables",
    )
    p.add_argument(
        "--punc",
        default=os.environ.get("FUNASR_PUNC", "ct-punc"),
        help="Punctuation model; improves diarization sentence_info (empty disables)",
    )
    p.add_argument(
        "--device",
        default=os.environ.get("FUNASR_DEVICE", "cpu"),
        help="cpu (default) or cuda",
    )
    p.add_argument(
        "--hub",
        default=os.environ.get("FUNASR_HUB", "ms"),
        help="modelscope ms or hf",
    )
    p.add_argument(
        "--batch-size-s",
        type=int,
        default=int(os.environ.get("FUNASR_BATCH_SIZE_S", "60")),
        help="FunASR batch_size_s",
    )
    p.add_argument(
        "--self-test-parse",
        action="store_true",
        help="Run parser unit fixture and exit (no model load)",
    )
    args = p.parse_args()

    if args.self_test_parse:
        fixture = [
            {
                "sentence_info": [
                    {
                        "text": "<|zh|><|NEUTRAL|>你好",
                        "start": 0,
                        "end": 1200,
                        "spk": 0,
                    },
                    {"text": "大家好", "start": 1200, "end": 2500, "spk": 1},
                ]
            }
        ]
        segs = parse_funasr_result(fixture)
        assert len(segs) == 2 and segs[0]["speaker"] == "Speaker 0"
        assert segs[0]["text"] == "你好"
        assert segs[0]["startMs"] == 0 and segs[0]["endMs"] == 1200
        assert segs[1]["speaker"] == "Speaker 1"
        emit_json({"ok": True, "segments": segs})
        return 0

    spk = args.spk.strip() if args.spk is not None else ""
    spk_model = spk if spk else None

    if args.serve:
        for line in sys.stdin:
            line = line.strip()
            if not line:
                continue
            try:
                req = json.loads(line)
            except json.JSONDecodeError as e:
                emit_json(
                    {
                        "status": "failed",
                        "engine": "funasr",
                        "segments": [],
                        "errorMessage": str(e),
                    }
                )
                continue
            audio = req.get("audio") or req.get("path")
            punc_raw = req.get("punc") if "punc" in req else args.punc
            punc_model = (str(punc_raw).strip() or None) if punc_raw is not None else None
            out = transcribe_file(
                audio,
                model_id=req.get("model") or args.model,
                vad_model=req.get("vad") or args.vad,
                spk_model=(req.get("spk") if "spk" in req else spk_model),
                device=req.get("device") or args.device,
                hub=req.get("hub") or args.hub,
                batch_size_s=int(req.get("batch_size_s") or args.batch_size_s),
                punc_model=punc_model,
            )
            if req.get("request_id") is not None:
                out["request_id"] = req["request_id"]
            emit_json(out)
        return 0

    if not args.audio:
        p.error("--audio is required unless --serve or --self-test-parse")

    punc_model = args.punc.strip() if args.punc else None
    out = transcribe_file(
        args.audio,
        model_id=args.model,
        vad_model=args.vad,
        spk_model=spk_model,
        device=args.device,
        hub=args.hub,
        batch_size_s=args.batch_size_s,
        punc_model=punc_model,
    )
    emit_json(out)
    return 0 if out.get("status") in ("succeeded", "degraded") else 2


if __name__ == "__main__":
    raise SystemExit(main())
