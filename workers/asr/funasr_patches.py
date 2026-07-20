"""
Runtime patches for FunASR — quality-preserving bugfixes.

Root crash (long audio / SenseVoice + punc + cam++):
  TypeError: '>' not supported between instances of 'float' and 'NoneType'
in funasr.utils.timestamp_tools.timestamp_sentence when zip_longest pads
punc/timestamp/text with None.

We rebind timestamp_sentence / timestamp_sentence_en (and the copies imported
into funasr.auto.auto_model) so the full pipeline (VAD+ASR+punc+spk) still runs.
"""

from __future__ import annotations

import logging
from typing import Any, List, Optional, Sequence

_PATCHED = False


def _as_float_pair(ts: Any) -> Optional[list]:
    if ts is None:
        return None
    try:
        if isinstance(ts, (list, tuple)) and len(ts) >= 2:
            return [float(ts[0]), float(ts[1])]
    except (TypeError, ValueError):
        return None
    return None


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

    texts = text_postprocessed.split() if isinstance(text_postprocessed, str) else list(text_postprocessed)

    if punc_id_list is None or len(punc_id_list) == 0:
        res.append(
            {
                "text": texts if texts else text_postprocessed,
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
    if len(punc_id_list) != len(timestamp_postprocessed) or len(texts) != n:
        logging.warning(
            "length mismatch between punc/timestamp/text (patched): punc=%s raw_ts=%s ts=%s texts=%s use_n=%s",
            len(punc_id_list),
            len(timestamp_postprocessed),
            len(ts_clean),
            len(texts),
            n,
        )

    # Map texts onto n slots (Chinese char timestamps often 1:1 with tokens)
    if len(texts) == n:
        texts_use = texts
    elif len(texts) == 0:
        texts_use = [""] * n
    elif len(texts) > n:
        # merge overflow into last token
        texts_use = texts[: n - 1] + [" ".join(texts[n - 1 :])]
    else:
        texts_use = texts + [""] * (n - len(texts))

    sentence_text = ""
    sentence_text_seg = ""
    ts_list: list = []
    sentence_start: Optional[float] = ts_clean[0][0]
    sentence_end: float = ts_clean[0][1]

    for i in range(n):
        punc_id = punc_id_list[i]
        pair = ts_clean[i]
        text = texts_use[i] if i < len(texts_use) else None
        t0, t1 = pair[0], pair[1]

        if sentence_start is None:
            sentence_start = t0

        if text:
            ch0 = text[0]
            if sentence_text and (
                ("a" <= ch0 <= "z")
                or ("A" <= ch0 <= "Z")
                or (
                    sentence_text
                    and (
                        "a" <= sentence_text[-1] <= "z"
                        or "A" <= sentence_text[-1] <= "Z"
                    )
                )
            ):
                sentence_text += " " + text
            else:
                sentence_text += text
            sentence_text_seg += text + " "

        ts_list.append([t0, t1])
        try:
            pid = int(punc_id) if punc_id is not None else 1
        except (TypeError, ValueError):
            pid = 1
        sentence_end = t1
        if sentence_text_seg.endswith(" "):
            sentence_text_seg = sentence_text_seg[:-1]

        if pid > 1:
            if 2 <= pid <= 1 + len(punc_chars):
                sentence_text += punc_chars[pid - 2]
            item: dict[str, Any] = {
                "text": sentence_text,
                "start": sentence_start if sentence_start is not None else t0,
                "end": sentence_end,
                "timestamp": ts_list,
            }
            if return_raw_text:
                item["raw_text"] = sentence_text_seg
            res.append(item)
            sentence_text = ""
            sentence_text_seg = ""
            ts_list = []
            sentence_start = None

    if sentence_text and ts_list:
        item = {
            "text": sentence_text,
            "start": sentence_start if sentence_start is not None else ts_list[0][0],
            "end": sentence_end,
            "timestamp": ts_list,
        }
        if return_raw_text:
            item["raw_text"] = sentence_text_seg
        res.append(item)
    return res


def timestamp_sentence_safe(
    punc_id_list, timestamp_postprocessed, text_postprocessed, return_raw_text=False
):
    return _timestamp_sentence_impl(
        punc_id_list,
        timestamp_postprocessed,
        text_postprocessed,
        return_raw_text,
        ["，", "。", "？", "、"],
    )


def timestamp_sentence_en_safe(
    punc_id_list, timestamp_postprocessed, text_postprocessed, return_raw_text=False
):
    return _timestamp_sentence_impl(
        punc_id_list,
        timestamp_postprocessed,
        text_postprocessed,
        return_raw_text,
        [",", ".", "?", ","],
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
    logging.info("funasr_patches: safe timestamp_sentence applied (keep punc+spk)")
