"""Load arbitrary common audio formats → mono float32 16 kHz (+ optional temp wav)."""

from __future__ import annotations

import os
import tempfile
from pathlib import Path
from typing import Any


def log(msg: str) -> None:
    print(msg, file=__import__("sys").stderr, flush=True)


def progress(stage: str, percent: int, message: str = "") -> None:
    """Machine-readable progress for the Node parent process."""
    import json

    payload = {"stage": stage, "percent": max(0, min(100, int(percent))), "message": message}
    print(f"PROGRESS {json.dumps(payload, ensure_ascii=False)}", file=__import__("sys").stderr, flush=True)


def load_mono_16k(path: str | Path) -> tuple[Any, int]:
    """
    Returns (float32 numpy array shape [n,], sample_rate=16000).
    Tries soundfile → librosa → torchaudio.
    """
    import numpy as np

    path = Path(path)
    if not path.is_file():
        raise FileNotFoundError(str(path))

    target_sr = 16000
    last_err: Exception | None = None

    # 1) soundfile (wav/flac/ogg …)
    try:
        import soundfile as sf

        data, sr = sf.read(str(path), always_2d=False)
        data = np.asarray(data, dtype=np.float32)
        if data.ndim > 1:
            data = data.mean(axis=1)
        if sr != target_sr:
            data = _resample(data, sr, target_sr)
        return data, target_sr
    except Exception as e:
        last_err = e
        log(f"[audio_io] soundfile failed: {e}")

    # 2) librosa (many formats if audioread/ffmpeg available)
    try:
        import librosa

        data, sr = librosa.load(str(path), sr=target_sr, mono=True)
        return np.asarray(data, dtype=np.float32), target_sr
    except Exception as e:
        last_err = e
        log(f"[audio_io] librosa failed: {e}")

    # 3) torchaudio
    try:
        import torch
        import torchaudio

        wav, sr = torchaudio.load(str(path))
        if wav.shape[0] > 1:
            wav = wav.mean(dim=0, keepdim=True)
        wav = wav.squeeze(0).numpy().astype("float32")
        if sr != target_sr:
            wav = _resample(wav, int(sr), target_sr)
        return wav, target_sr
    except Exception as e:
        last_err = e
        log(f"[audio_io] torchaudio failed: {e}")

    raise RuntimeError(
        f"无法解码音频 {path.name}（已试 soundfile/librosa/torchaudio）。"
        f" 请安装 ffmpeg 或转换为 wav。最后错误: {last_err}"
    )


def _resample(data: Any, orig_sr: int, target_sr: int) -> Any:
    import numpy as np

    if orig_sr == target_sr:
        return data
    try:
        import librosa

        return librosa.resample(np.asarray(data, dtype=np.float32), orig_sr=orig_sr, target_sr=target_sr)
    except Exception:
        pass
    try:
        import torch
        import torchaudio

        t = torch.from_numpy(np.asarray(data, dtype=np.float32)).unsqueeze(0)
        t = torchaudio.functional.resample(t, orig_sr, target_sr)
        return t.squeeze(0).numpy()
    except Exception as e:
        raise RuntimeError(f"重采样 {orig_sr}→{target_sr} 失败: {e}") from e


def write_wav_16k(path: str | Path, data: Any, sr: int = 16000) -> Path:
    import numpy as np
    import soundfile as sf

    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    arr = np.asarray(data, dtype=np.float32)
    # clip to avoid overflow
    arr = np.clip(arr, -1.0, 1.0)
    sf.write(str(path), arr, sr, subtype="PCM_16")
    return path


def prepare_for_funasr(src: str | Path) -> tuple[Path, bool]:
    """
    Return a local 16k mono wav path FunASR can open on Windows.
    Uses a short temp path under %TEMP% to avoid WinError 2 on odd paths/codecs.
    Returns (path, is_temp) — caller should delete temp when done.
    """
    src = Path(src).resolve()
    progress("convert", 8, f"解码音频 {src.name}")

    # Already wav? still re-encode to 16k mono for consistency
    data, sr = load_mono_16k(src)
    progress("convert", 15, "写成 16kHz 单声道 wav")

    tmp_dir = Path(os.environ.get("TEMP") or os.environ.get("TMP") or tempfile.gettempdir())
    # short ASCII name — Windows FunASR/ffmpeg are picky
    fd, name = tempfile.mkstemp(prefix="mr_asr_", suffix=".wav", dir=str(tmp_dir))
    os.close(fd)
    out = Path(name)
    write_wav_16k(out, data, sr)
    progress("convert", 20, f"转码完成 {out.name} ({out.stat().st_size} bytes)")
    return out, True
