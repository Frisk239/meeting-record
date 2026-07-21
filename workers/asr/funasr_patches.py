"""
Runtime patches for FunASR — quality-preserving bugfixes.

Root crash (long audio / SenseVoice + punc + cam++):
  TypeError: '>' not supported between instances of 'float' and 'NoneType'
in funasr.utils.timestamp_tools.timestamp_sentence when zip_longest pads
punc/timestamp/text with None.

We rebind timestamp_sentence / timestamp_sentence_en (and the copies imported
into funasr.auto.auto_model) so the full pipeline (VAD+ASR+punc+spk) still runs.

Also prevents pure-punctuation "sentences" when text tokens are shorter than
punc/timestamp streams (common with SenseVoice / non 1:1 Chinese alignment).
Those ghosts were assigned Speaker 1/2 and wiped real multi-speaker UI.
"""

from __future__ import annotations

import logging
import re
from typing import Any, List, Optional, Sequence

_PATCHED = False

# CT-Transformer punc ids: 1=none, 2=comma, 3=period, 4=question, 5=dunhao
_PUNC_CHARS_ZH = ["\uff0c", "\u3002", "\uff1f", "\u3001"]  # ，。？、
_PUNC_CHARS_EN = [",", ".", "?", ","]
_PURE_PUNC_RE = re.compile(
    r"^[\s,.\?\!;:\uff0c\u3002\uff1f\u3001\uff1b\uff1a\u2026\u00b7\-\u2014\"'\u201c\u201d\u2018\u2019\uff08\uff09()\[\]\u3010\u3011\u300a\u300b<>]+$"
)


def _as_float_pair(ts: Any) -> Optional[list]:
    if ts is None:
        return None
    try:
        if isinstance(ts, (list, tuple)) and len(ts) >= 2:
            return [float(ts[0]), float(ts[1])]
    except (TypeError, ValueError):
        return None
    return None


def _is_pure_punc(text: str) -> bool:
    t = (text or "").strip()
    return (not t) or bool(_PURE_PUNC_RE.fullmatch(t))


def _align_text_tokens(text_postprocessed: Any, n: int) -> list[str]:
    """Align ASR text to n timestamp/punc slots (prefer char-level for Chinese)."""
    if n <= 0:
        return []

    if not isinstance(text_postprocessed, str):
        texts = [str(x) for x in list(text_postprocessed)]
        raw = "".join(texts)
    else:
        raw = text_postprocessed
        texts = raw.split() if raw.strip() else []

    if len(texts) == n:
        return texts

    compact = raw.replace(" ", "").replace("\t", "").replace("\n", "")
    if len(compact) == n:
        return list(compact)

    if len(texts) == 1 and len(texts[0]) == n:
        return list(texts[0])

    joined = "".join(texts) if texts else compact
    if len(joined) == n:
        return list(joined)

    if len(texts) > n:
        if n == 1:
            return [" ".join(texts)]
        return texts[: n - 1] + [" ".join(texts[n - 1 :])]

    if len(texts) == 0:
        return [""] * n

    # Fewer tokens than slots: keep real tokens first, pad empty.
    # Caller must not emit pure-punctuation sentences for empty pads.
    return texts + [""] * (n - len(texts))


def _timestamp_sentence_impl(
    punc_id_list,
    timestamp_postprocessed,
    text_postprocessed,
    return_raw_text: bool,
    punc_chars: Sequence[str],
) -> List[dict]:
    res: List[dict] = []
    if not text_postprocessed:
        return res
    if not timestamp_postprocessed:
        return res

    ts_clean = []
    for t in timestamp_postprocessed:
        pair = _as_float_pair(t)
        if pair is not None:
            ts_clean.append(pair)
    if not ts_clean:
        return res

    if punc_id_list is None or len(punc_id_list) == 0:
        if isinstance(text_postprocessed, str):
            whole = text_postprocessed.replace(" ", "")
        else:
            whole = "".join(str(x) for x in text_postprocessed)
        res.append(
            {
                "text": whole if whole else text_postprocessed,
                "start": ts_clean[0][0],
                "end": ts_clean[-1][1],
                "timestamp": ts_clean,
            }
        )
        return res

    # Align by minimum length — never zip_longest with None timestamps
    n = min(len(punc_id_list), len(ts_clean))
    if n == 0:
        return res

    texts_use = _align_text_tokens(text_postprocessed, n)
    if len(punc_id_list) != len(timestamp_postprocessed) or len(texts_use) != n:
        logging.warning(
            "length mismatch between punc/timestamp/text (patched): punc=%s raw_ts=%s ts=%s texts_use=%s use_n=%s",
            len(punc_id_list),
            len(timestamp_postprocessed),
            len(ts_clean),
            len(texts_use),
            n,
        )

    sentence_text = ""
    sentence_text_seg = ""
    ts_list: list = []
    sentence_start: Optional[float] = ts_clean[0][0]
    sentence_end: float = ts_clean[0][1]

    def _append_token(text: str) -> None:
        nonlocal sentence_text, sentence_text_seg
        if not text:
            return
        ch0 = text[0]
        if sentence_text and (
            ("a" <= ch0 <= "z")
            or ("A" <= ch0 <= "Z")
            or (
                "a" <= sentence_text[-1] <= "z"
                or "A" <= sentence_text[-1] <= "Z"
            )
        ):
            sentence_text += " " + text
        else:
            sentence_text += text
        sentence_text_seg += text + " "

    def _flush_sentence(punc_char: str = "") -> None:
        nonlocal sentence_text, sentence_text_seg, ts_list, sentence_start
        body = sentence_text
        if punc_char:
            body = body + punc_char

        if _is_pure_punc(body):
            # Attach orphan punctuation mark to previous sentence text only.
            # Do NOT extend end/timestamps over empty text slots (long-audio
            # misalignment tails would otherwise swallow the rest of the file).
            if res and punc_char:
                prev = str(res[-1].get("text") or "")
                if not prev.endswith(punc_char):
                    res[-1]["text"] = prev + punc_char
            sentence_text = ""
            sentence_text_seg = ""
            ts_list = []
            sentence_start = None
            return

        if not body.strip():
            sentence_text = ""
            sentence_text_seg = ""
            ts_list = []
            sentence_start = None
            return

        item: dict[str, Any] = {
            "text": body,
            "start": sentence_start if sentence_start is not None else (ts_list[0][0] if ts_list else 0),
            "end": sentence_end,
            "timestamp": ts_list,
        }
        if return_raw_text:
            seg = sentence_text_seg[:-1] if sentence_text_seg.endswith(" ") else sentence_text_seg
            item["raw_text"] = seg
        res.append(item)
        sentence_text = ""
        sentence_text_seg = ""
        ts_list = []
        sentence_start = None

    for i in range(n):
        punc_id = punc_id_list[i]
        pair = ts_clean[i]
        text = texts_use[i] if i < len(texts_use) else ""
        t0, t1 = pair[0], pair[1]

        if sentence_start is None:
            sentence_start = t0

        _append_token(text)

        ts_list.append([t0, t1])
        try:
            pid = int(punc_id) if punc_id is not None else 1
        except (TypeError, ValueError):
            pid = 1
        sentence_end = t1
        if sentence_text_seg.endswith(" "):
            sentence_text_seg = sentence_text_seg[:-1]

        if pid > 1:
            punc_char = ""
            if 2 <= pid <= 1 + len(punc_chars):
                punc_char = punc_chars[pid - 2]
            _flush_sentence(punc_char)

    if sentence_text and ts_list:
        _flush_sentence("")
    return res


def timestamp_sentence_safe(
    punc_id_list, timestamp_postprocessed, text_postprocessed, return_raw_text=False
):
    return _timestamp_sentence_impl(
        punc_id_list,
        timestamp_postprocessed,
        text_postprocessed,
        return_raw_text,
        _PUNC_CHARS_ZH,
    )


def timestamp_sentence_en_safe(
    punc_id_list, timestamp_postprocessed, text_postprocessed, return_raw_text=False
):
    return _timestamp_sentence_impl(
        punc_id_list,
        timestamp_postprocessed,
        text_postprocessed,
        return_raw_text,
        _PUNC_CHARS_EN,
    )


def apply_funasr_patches() -> None:
    global _PATCHED
    if _PATCHED:
        return
    try:
        import funasr.utils.timestamp_tools as tt
        import funasr.auto.auto_model as am
    except Exception as e:
        logging.warning("funasr_patches: cannot import funasr: %s", e)
        return

    tt.timestamp_sentence = timestamp_sentence_safe
    tt.timestamp_sentence_en = timestamp_sentence_en_safe
    # auto_model did `from ... import timestamp_sentence` — rebind names in that module
    am.timestamp_sentence = timestamp_sentence_safe
    am.timestamp_sentence_en = timestamp_sentence_en_safe
    _PATCHED = True
    logging.info("funasr_patches: safe timestamp_sentence applied (keep punc+spk, drop pure-punc ghosts)")
