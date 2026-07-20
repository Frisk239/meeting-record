"""Load arbitrary common audio formats → mono float32 16 kHz (+ temp wav for FunASR)."""

from __future__ import annotations

import os
import shutil
import subprocess
import tempfile
from pathlib import Path
from typing import Any


def log(msg: str) -> None:
    # Prefer ASCII-safe log lines for Windows consoles; keep full detail in exceptions carefully
    print(msg, file=__import__("sys").stderr, flush=True)


def progress(stage: str, percent: int, message: str = "") -> None:
    """Machine-readable progress for the Node parent process (UTF-8 JSON)."""
    import json
    import sys

    payload = {
        "stage": stage,
        "percent": max(0, min(100, int(percent))),
        "message": message,
    }
    line = "PROGRESS " + json.dumps(payload, ensure_ascii=False)
    try:
        sys.stderr.buffer.write((line + "\n").encode("utf-8", errors="replace"))
        sys.stderr.buffer.flush()
    except Exception:
        print(line, file=sys.stderr, flush=True)


def find_ffmpeg() -> str | None:
    """System PATH first, then imageio-ffmpeg bundled binary."""
    which = shutil.which("ffmpeg")
    if which:
        return which
    try:
        import imageio_ffmpeg  # type: ignore

        exe = imageio_ffmpeg.get_ffmpeg_exe()
        if exe and Path(exe).is_file():
            return exe
    except Exception as e:
        log(f"[audio_io] imageio_ffmpeg not available: {e}")
    return None


def ffmpeg_to_wav16k(src: Path, dst: Path) -> None:
    ff = find_ffmpeg()
    if not ff:
        raise RuntimeError(
            "ffmpeg not found. Install system ffmpeg or: pip install imageio-ffmpeg"
        )
    dst.parent.mkdir(parents=True, exist_ok=True)
    # -y overwrite; 16k mono pcm_s16le
    cmd = [
        ff,
        "-hide_banner",
        "-loglevel",
        "error",
        "-y",
        "-i",
        str(src),
        "-ac",
        "1",
        "-ar",
        "16000",
        "-c:a",
        "pcm_s16le",
        str(dst),
    ]
    log(f"[audio_io] ffmpeg convert: {src.name} -> {dst.name}")
    proc = subprocess.run(
        cmd,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        timeout=600,
    )
    if proc.returncode != 0 or not dst.is_file() or dst.stat().st_size < 44:
        err = (proc.stderr or proc.stdout or "").strip()[:400]
        raise RuntimeError(f"ffmpeg convert failed (code={proc.returncode}): {err or 'no output'}")


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

    try:
        import librosa

        data, sr = librosa.load(str(path), sr=target_sr, mono=True)
        return np.asarray(data, dtype=np.float32), target_sr
    except Exception as e:
        last_err = e
        log(f"[audio_io] librosa failed: {e}")

    try:
        import torch
        import torchaudio

        wav, sr = torchaudio.load(str(path))
        if wav.shape[0] > 1:
            wav = wav.mean(dim=0, keepdim=True)
        wav = wav.squeeze(0).numpy().astype("float32")
        if int(sr) != target_sr:
            wav = _resample(wav, int(sr), target_sr)
        return wav, target_sr
    except Exception as e:
        last_err = e
        log(f"[audio_io] torchaudio failed: {e}")

    raise RuntimeError(f"native decode failed for {path.name}: {last_err}")


def _resample(data: Any, orig_sr: int, target_sr: int) -> Any:
    import numpy as np

    if orig_sr == target_sr:
        return data
    try:
        import librosa

        return librosa.resample(
            np.asarray(data, dtype=np.float32), orig_sr=orig_sr, target_sr=target_sr
        )
    except Exception:
        pass
    try:
        import torch
        import torchaudio

        t = torch.from_numpy(np.asarray(data, dtype=np.float32)).unsqueeze(0)
        t = torchaudio.functional.resample(t, orig_sr, target_sr)
        return t.squeeze(0).numpy()
    except Exception as e:
        raise RuntimeError(f"resample {orig_sr}->{target_sr} failed: {e}") from e


def write_wav_16k(path: str | Path, data: Any, sr: int = 16000) -> Path:
    import numpy as np
    import soundfile as sf

    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    arr = np.clip(np.asarray(data, dtype=np.float32), -1.0, 1.0)
    sf.write(str(path), arr, sr, subtype="PCM_16")
    return path


def prepare_for_funasr(src: str | Path) -> tuple[Path, bool]:
    """
    Return a local 16k mono wav path FunASR can open on Windows.
    Prefers ffmpeg (system or imageio-ffmpeg) for m4a/mp3/webm.
    Returns (path, is_temp).
    """
    src = Path(src).resolve()
    if not src.is_file():
        raise FileNotFoundError(f"audio not found: {src}")

    progress("convert", 8, f"decode {src.suffix or 'audio'}")

    tmp_dir = Path(os.environ.get("TEMP") or os.environ.get("TMP") or tempfile.gettempdir())
    fd, name = tempfile.mkstemp(prefix="mr_asr_", suffix=".wav", dir=str(tmp_dir))
    os.close(fd)
    out = Path(name)

    # 1) ffmpeg first — best for m4a / mp3 / webm / browser recordings
    ff = find_ffmpeg()
    if ff:
        try:
            progress("convert", 12, "ffmpeg to 16k mono wav")
            ffmpeg_to_wav16k(src, out)
            progress("convert", 20, f"converted via ffmpeg ({out.stat().st_size} bytes)")
            return out, True
        except Exception as e:
            log(f"[audio_io] ffmpeg path failed, try native: {e}")
            try:
                out.unlink(missing_ok=True)
            except Exception:
                pass
            fd, name = tempfile.mkstemp(prefix="mr_asr_", suffix=".wav", dir=str(tmp_dir))
            os.close(fd)
            out = Path(name)

    # 2) Native Python loaders
    try:
        progress("convert", 12, "native decode")
        data, sr = load_mono_16k(src)
        progress("convert", 15, "write 16k mono wav")
        write_wav_16k(out, data, sr)
        progress("convert", 20, f"converted ({out.stat().st_size} bytes)")
        return out, True
    except Exception as e:
        try:
            out.unlink(missing_ok=True)
        except Exception:
            pass
        # Clear bilingual message for UI (UTF-8); avoid mojibake
        raise RuntimeError(
            "Cannot decode audio "
            f"{src.name}. Tried ffmpeg + soundfile/librosa/torchaudio. "
            "For m4a/mp3/webm install ffmpeg (winget install Gyan.FFmpeg) "
            "or: pip install imageio-ffmpeg. "
            f"Detail: {e}"
        ) from e
