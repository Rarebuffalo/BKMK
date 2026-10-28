"""Original soundtrack + SFX for the BKMK.exe teaser, synthesised from scratch.

No samples or third-party audio: every sound is generated here with numpy.
Tempo is chosen so the drop lands exactly on the Bookmark DNA reveal cut.
SFX times come from the recorder markers mapped through the edit timeline.
"""

import json
import wave
from pathlib import Path

import numpy as np

D = Path(__file__).parent
SR = 44100
TL = json.loads((D / "timeline.json").read_text())
MK = json.loads((D / "markers.json").read_text())
SEC = {s["name"]: s for s in TL["sections"]}
TOTAL = TL["total"]
N = int((TOTAL + 0.05) * SR)
rng = np.random.default_rng(7)

DROP = SEC["reveal"]["start"]  # 12.7 s
BAR = DROP / 6  # six bars before the drop
BEAT = BAR / 4
BPM = 60 / BEAT


def out_time(section: str, src: float) -> float:
    """Map a time in the raw recording to the edited video's timeline."""
    s = SEC[section]
    return s["start"] + (src - s["src"][0]) / s["speed"]


# ── primitives ────────────────────────────────────────────────────────────


def t_arr(dur: float) -> np.ndarray:
    return np.arange(int(dur * SR)) / SR


def saw(freq: float, dur: float, cutoff: float = 4000, detune: float = 0.0) -> np.ndarray:
    """Band-limited sawtooth by additive synthesis; harmonics above cutoff are omitted (a clean low-pass)."""
    t = t_arr(dur)
    f = freq * (1 + detune)
    out = np.zeros_like(t)
    for k in range(1, max(1, int(cutoff / f)) + 1):
        out += np.sin(2 * np.pi * k * f * t) / k
    return out * 0.6


def square(freq: float, dur: float, cutoff: float = 3000) -> np.ndarray:
    t = t_arr(dur)
    out = np.zeros_like(t)
    for k in range(1, max(1, int(cutoff / freq)) + 1, 2):
        out += np.sin(2 * np.pi * k * freq * t) / k
    return out * 0.7


def env(n: int, a: float = 0.005, d: float = 0.1, s: float = 0.6, r: float = 0.1) -> np.ndarray:
    e = np.ones(n) * s
    ai, di, ri = int(a * SR), int(d * SR), int(r * SR)
    ai = min(ai, n)
    e[:ai] = np.linspace(0, 1, ai, endpoint=False)
    di = min(di, n - ai)
    e[ai : ai + di] = np.linspace(1, s, di, endpoint=False)
    ri = min(ri, n)
    e[n - ri :] *= np.linspace(1, 0, ri)
    return e


def shaped_noise(dur: float, lo: float, hi: float) -> np.ndarray:
    n = int(dur * SR)
    spec = np.fft.rfft(rng.standard_normal(n))
    f = np.fft.rfftfreq(n, 1 / SR)
    spec[(f < lo) | (f > hi)] = 0
    x = np.fft.irfft(spec, n)
    return x / (np.abs(x).max() + 1e-9)


def note(name: str) -> float:
    names = {"C": -9, "C#": -8, "D": -7, "D#": -6, "E": -5, "F": -4, "F#": -3, "G": -2, "G#": -1, "A": 0, "A#": 1, "B": 2}
    return 440 * 2 ** ((names[name[:-1]] + 12 * (int(name[-1]) - 4)) / 12)


L = np.zeros(N)
R = np.zeros(N)


def add(sig: np.ndarray, at: float, gain: float = 1.0, pan: float = 0.0) -> None:
    i = int(at * SR)
    if i >= N or i + len(sig) <= 0:
        return
    sig = sig[: N - i]
    L[i : i + len(sig)] += sig * gain * (1 - max(0, pan))
    R[i : i + len(sig)] += sig * gain * (1 + min(0, pan))


# ── arrangement ──────────────────────────────────────────────────────────

CHORDS = {
    "Am": ["A3", "C4", "E4"],
    "F": ["F3", "A3", "C4"],
    "C": ["C4", "E4", "G4"],
    "G": ["G3", "B3", "D4"],
}
ROOT = {"Am": "A1", "F": "F1", "C": "C2", "G": "G1"}
PROG = ["C", "G", "Am", "F", "C", "G", "Am", "F", "C", "G", "Am", "F", "C", "Am"]  # bar 6 = Am on the drop
n_bars = int(np.ceil(TOTAL / BAR)) + 1
OUTRO_BAR = int(round(SEC["outro"]["start"] / BAR))

for b in range(n_bars):
    t0 = b * BAR
    if t0 >= TOTAL:
        break
    chord = PROG[min(b, len(PROG) - 1)]
    final = b >= OUTRO_BAR + 1
    # Pad: three detuned saws per chord tone, slow attack, darker before the drop.
    pad_cut = 900 if b < 3 else 1400 if b < 6 else 2200
    for nm in CHORDS[chord]:
        for dt, pan in ((-0.004, -0.5), (0.0, 0.0), (0.004, 0.5)):
            dur = BAR * (3 if final else 1.02)
            s = saw(note(nm), dur, pad_cut, dt) * env(int(dur * SR), a=0.25 if b else 0.9, d=0.3, s=0.8, r=0.35 if not final else 2.2)
            add(s, t0, 0.022 if b < 6 else 0.026, pan)
    if final:
        break
    # Bass: 8th-note pluck on the root from bar 1.
    if b >= 1:
        for i in range(8):
            s = saw(note(ROOT[chord]) * 2, BEAT / 2, 700 if b < 6 else 1100)
            s *= env(len(s), a=0.003, d=0.12, s=0.35, r=0.05)
            add(s, t0 + i * BEAT / 2, 0.16 if b < 6 else 0.2)
    # Arp: 16ths over the chord during the scan build and the drop, filter opening up.
    if 3 <= b < OUTRO_BAR:
        tones = [note(x) * 2 for x in CHORDS[chord]] + [note(CHORDS[chord][0]) * 4]
        for i in range(16):
            prog = (b - 3 + i / 16) / 3 if b < 6 else 1
            s = square(tones[[0, 1, 2, 3, 2, 1, 0, 1][i % 8]], BEAT / 4, 900 + 3000 * min(1, prog))
            s *= env(len(s), a=0.002, d=0.06, s=0.2, r=0.03)
            add(s, t0 + i * BEAT / 4, 0.05, -0.35 if i % 2 else 0.35)
    # Lead: a short pentatonic hook over the drop (bars 6–9).
    if 6 <= b < 10:
        hook = [("E5", 0, 1), ("G5", 1, 0.5), ("A5", 1.5, 1.5), ("C6", 3, 0.5), ("A5", 3.5, 0.5)] if b % 2 == 0 else [("G5", 0, 1), ("E5", 1, 1), ("D5", 2, 1), ("E5", 3, 1)]
        for nm, at, ln in hook:
            s = saw(note(nm), ln * BEAT, 3200, 0.002) + saw(note(nm), ln * BEAT, 3200, -0.002)
            s *= env(len(s), a=0.01, d=0.15, s=0.55, r=0.12)
            add(s, t0 + at * BEAT, 0.035)
    # Drums
    for i in range(4):
        bt = t0 + i * BEAT
        four = 3 <= b < OUTRO_BAR
        if (b in (1, 2) and i in (0, 2)) or four:
            tt = t_arr(0.38)
            k = np.sin(2 * np.pi * (45 * tt + (150 - 45) * (1 - np.exp(-tt * 28)) / 28)) * np.exp(-tt * 9)
            add(k, bt, 0.42 if b >= 6 else 0.32)
        if b >= 6 and b < OUTRO_BAR and i in (1, 3):
            sn = shaped_noise(0.2, 900, 7000) * np.exp(-t_arr(0.2) * 22) + np.sin(2 * np.pi * 185 * t_arr(0.2)) * np.exp(-t_arr(0.2) * 30) * 0.5
            add(sn, bt, 0.13)
        if b >= 1 and b < OUTRO_BAR:
            for h in (0, 0.5):
                hh = shaped_noise(0.04, 7000, 16000) * np.exp(-t_arr(0.04) * 90)
                add(hh, bt + h * BEAT, 0.035 if b < 6 else 0.05, 0.3)

# Riser into the drop (bar 5) and a snare roll on its last half bar.
rise_d = BAR
rz = shaped_noise(rise_d, 1500, 9000) * np.linspace(0, 1, int(rise_d * SR)) ** 2
add(rz, DROP - rise_d, 0.09)
for i in range(8):
    sn = shaped_noise(0.1, 1200, 7000) * np.exp(-t_arr(0.1) * 30)
    add(sn, DROP - BAR / 2 + i * BAR / 16, 0.05 + 0.012 * i)
# Crash on the drop and a sub boom.
add(shaped_noise(2.2, 4000, 16000) * np.exp(-t_arr(2.2) * 2.2), DROP, 0.13)
tt = t_arr(1.2)
add(np.sin(2 * np.pi * 42 * tt) * np.exp(-tt * 3.5), DROP, 0.35)

# ── SFX synced to on-screen events ───────────────────────────────────────


def blip(freq: float, dur: float = 0.06) -> np.ndarray:
    s = square(freq, dur, 4000)
    return s * env(len(s), a=0.002, d=0.03, s=0.3, r=0.02)


def bell(freqs: list[float], gap: float = 0.07, dur: float = 0.6) -> np.ndarray:
    out = np.zeros(int((dur + gap * len(freqs)) * SR))
    for j, f in enumerate(freqs):
        t = t_arr(dur)
        s = (np.sin(2 * np.pi * f * t) + 0.3 * np.sin(2 * np.pi * f * 2.76 * t)) * np.exp(-t * 7)
        i = int(j * gap * SR)
        out[i : i + len(s)] += s
    return out


def click() -> np.ndarray:
    return shaped_noise(0.018, 2000, 9000) * np.exp(-t_arr(0.018) * 260)


intro0 = SEC["intro"]["src"][0]
for d in (0.05, 0.35, 0.65, 0.9):  # boot lines in intro.html
    add(blip(1320), d - intro0, 0.05)
# Wordmark power-on: soft boom + bright stab.
wm = 1.15 - intro0
tt = t_arr(0.9)
add(np.sin(2 * np.pi * 55 * tt) * np.exp(-tt * 5), wm, 0.3)
for nm in ("A4", "E5", "A5"):
    s = saw(note(nm), 0.5, 5000) * env(int(0.5 * SR), a=0.004, d=0.2, s=0.1, r=0.2)
    add(s, wm, 0.05)

# Keyboard: handle typing (85 ms per key) and library search (110 ms per key).
for i in range(len("krishnassinghh")):
    add(click(), out_time("typing", MK["typing"] + 0.01 + 0.085 * i), 0.09, 0.2 if i % 2 else -0.2)
for i in range(len("agent")):
    add(click(), out_time("library", MK["library"] + 0.5 + 0.11 * i), 0.08)
# Button clicks: confirm and connect, share variant switch.
for name, src in (("connect", MK["confirm"] + 0.9), ("connect", MK["authorizing"]), ("share", MK["identity"])):
    add(blip(660, 0.03), out_time(name, src), 0.05)
# Scan page ticks (demo scan pages every ~0.52 s) and badge unlocks (every 0.38 s before the report).
for k in range(1, 7):
    add(blip(990, 0.025), out_time("scan", MK["scan"] + 0.7 + 0.52 * k), 0.035)
for j in range(7):
    t_unlock = MK["ready"] - 0.7 - 0.38 * (6 - j)
    add(bell([note("E6"), note("A6")], gap=0.05, dur=0.45), out_time("scan", t_unlock), 0.035, -0.3 + 0.1 * j)
add(blip(1760, 0.08), out_time("scan", MK["ready"]), 0.05)  # "Report ready."
add(bell([note("A5"), note("E6"), note("A6")], gap=0.06), DROP + 1.1, 0.05)  # archetype lands
add(bell([note("C6"), note("E6"), note("G6"), note("C7")], gap=0.06), out_time("share", MK["download"]), 0.05)

# ── reverb, fades, master ────────────────────────────────────────────────

ir_len = int(1.6 * SR)
ir = rng.standard_normal(ir_len) * np.exp(-np.arange(ir_len) / SR * 4.0)
ir[0] = 0
size = 1 << int(np.ceil(np.log2(N + ir_len)))
IR = np.fft.rfft(ir, size)
for ch in (L, R):
    wet = np.fft.irfft(np.fft.rfft(ch, size) * IR, size)[:N]
    ch += wet / np.abs(wet).max() * np.abs(ch).max() * 0.18

fade_in = int(0.08 * SR)
fade_out = int(1.0 * SR)
for ch in (L, R):
    ch[:fade_in] *= np.linspace(0, 1, fade_in)
    end = int(TOTAL * SR)
    ch[end - fade_out : end] *= np.linspace(1, 0, fade_out) ** 1.5
    ch[end:] = 0

mix = np.stack([L, R], axis=1)
mix /= np.abs(mix).max() / 0.7  # headroom; loudnorm + limiter happen in ffmpeg
with wave.open(str(D / "soundtrack.wav"), "wb") as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes((mix * 32767).astype("<i2").tobytes())
print(f"BPM {BPM:.1f}  bar {BAR:.3f}s  drop {DROP}s  total {TOTAL}s")
