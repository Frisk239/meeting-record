"""Red-capable repro for speaker=punctuation bug (meeting-record diarization).

Symptom (prod DB mtg_b70c...): ~1051 pure-punc segments (，。？、) with Speaker 0/1/2,
real text only in first ~5min timestamps; UI shows Speaker 1/2 as commas/periods.

Root causes under test:
1) timestamp_sentence patch emits punctuation-only sentences when text tokens
   are shorter than punc/timestamp streams.
2) parse_funasr_result keeps those pure-punc segments and assigns speakers.
"""
from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from funasr_patches import timestamp_sentence_safe  # noqa: E402
from worker import parse_funasr_result  # noqa: E402


def _is_pure_punc(text: str) -> bool:
    import re

    t = (text or "").strip()
    if not t:
        return True
    return bool(re.fullmatch(r"[\s,.\?\!;:，。？！、；：…·\-—\"'“”‘’（）()\[\]【】《》<>]+", t))


def test_timestamp_sentence_mismatched_text_should_not_emit_pure_punc():
    """Classic misalignment: few text tokens, many char timestamps + punc ids."""
    # 20 char slots; only 5 text tokens (simulates non-1:1 Chinese alignment)
    text = "实习 机会 非常 重要 啊"
    # punc ids: 1=none, 2=comma, 3=period, 4=question
    punc_ids = [1, 1, 1, 2, 1, 1, 3, 1, 1, 1, 2, 1, 1, 1, 4, 1, 1, 1, 3, 1]
    timestamps = [[i * 100, i * 100 + 80] for i in range(20)]

    sentences = timestamp_sentence_safe(punc_ids, timestamps, text)
    pure = [s for s in sentences if _is_pure_punc(str(s.get("text") or ""))]
    real = [s for s in sentences if not _is_pure_punc(str(s.get("text") or ""))]

    assert sentences, "expected some sentences"
    assert pure == [], f"pure-punc sentences leaked: {pure[:5]}"
    assert real, "expected real text sentences"
    joined = "".join(str(s.get("text") or "") for s in real)
    for token in text.split():
        assert token in joined, f"missing token {token!r} in {joined!r}"


def test_timestamp_sentence_no_space_chinese_should_align_chars():
    """Continuous Chinese (no spaces) with per-char timestamps must not dump all text early."""
    text = "同学们好今天讲实习课"  # 10 chars
    # 10 chars, 10 timestamps, punc break mid-way
    punc_ids = [1, 1, 1, 1, 3, 1, 1, 1, 1, 3]
    timestamps = [[i * 200, i * 200 + 180] for i in range(10)]

    sentences = timestamp_sentence_safe(punc_ids, timestamps, text)
    pure = [s for s in sentences if _is_pure_punc(str(s.get("text") or ""))]
    assert pure == [], f"pure-punc leaked: {pure}"
    assert len(sentences) >= 2, sentences
    # first sentence should end near first period break, not cover whole audio
    first_end = float(sentences[0]["end"])
    last_end = float(sentences[-1]["end"])
    assert first_end < last_end
    assert first_end <= 200 * 5 + 1, f"first sentence end too late: {first_end}"


def test_parse_filters_or_merges_pure_punc_sentence_info():
    raw = [
        {
            "sentence_info": [
                {"text": "实习很重要。", "start": 0, "end": 1200, "spk": 0},
                {"text": "，", "start": 1300, "end": 1400, "spk": 1},
                {"text": "。", "start": 1500, "end": 1600, "spk": 2},
                {"text": "大家准备简历。", "start": 1700, "end": 3000, "spk": 0},
                {"text": "？", "start": 3100, "end": 3200, "spk": 2},
            ]
        }
    ]
    segs = parse_funasr_result(raw)
    pure = [s for s in segs if _is_pure_punc(s["text"])]
    assert pure == [], f"parser kept pure punc: {segs}"
    assert any("实习" in s["text"] for s in segs)
    assert any("简历" in s["text"] for s in segs)
    # Speakers 1/2 should not appear solely due to punctuation ghosts
    speakers = {s["speaker"] for s in segs}
    assert "Speaker 1" not in speakers
    assert "Speaker 2" not in speakers


def main() -> int:
    tests = [
        test_timestamp_sentence_mismatched_text_should_not_emit_pure_punc,
        test_timestamp_sentence_no_space_chinese_should_align_chars,
        test_parse_filters_or_merges_pure_punc_sentence_info,
    ]
    failed = 0
    for fn in tests:
        try:
            fn()
            print(f"PASS {fn.__name__}")
        except Exception as e:
            failed += 1
            print(f"FAIL {fn.__name__}: {e}")
    print(f"\n{len(tests) - failed}/{len(tests)} passed")
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
