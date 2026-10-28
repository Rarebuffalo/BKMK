"""Cuts the real-app master recording into the ~30 s teaser (video only).

Each section is trimmed from master.mp4 by recorder markers, optionally sped
up (only waiting/typing stretches), given a push-in or caption, then joined
with short crossfades. Writes timeline.json for the soundtrack.
"""

import json
import subprocess
from pathlib import Path

D = Path(__file__).parent
M = json.loads((D / "markers.json").read_text())
FONT = str((D / "../../frontend/node_modules/@fontsource/silkscreen/files/silkscreen-latin-400-normal.woff").resolve())
FPS = 30
XF = 0.3  # crossfade length


def caption(text: str, start: float = 0.25, dur: float = 2.4, cx: str = "iw/2") -> str:
    # Pixel-font caption, top centre (that band is empty on these screens).
    t = text.replace(":", r"\:")
    fade = f"if(lt(t,{start}),0,if(lt(t,{start}+0.2),(t-{start})/0.2,if(lt(t,{start}+{dur}-0.25),1,max(0,({start}+{dur}-t)/0.25))))"
    box = (
        f"drawbox=x={cx}-{(len(text) * 25 + 56) // 2}:y=26:w={len(text) * 25 + 56}:h=58:color=0x0a0c0a@0.88:t=fill:"
        f"enable='between(t,{start},{start + dur})',"
    )
    return (
        box
        + f"drawtext=fontfile={FONT}:text='{t}':fontsize=30:fontcolor=0x86f26b:alpha='{fade}':x={cx.replace('iw', 'w')}-text_w/2:y=42:enable='between(t,{start},{start + dur})'"
    )


def push(z_end: float, frames: int, fx: float, fy: float) -> str:
    # Gentle zoom from 1.0 to z_end, anchored at (fx, fy) of the frame.
    rate = (z_end - 1) / frames
    return (
        f"zoompan=z='min(1+{rate:.6f}*on,{z_end})':d=1:x='(iw-iw/zoom)*{fx}':y='(ih-ih/zoom)*{fy}'"
        f":s=1920x1080:fps={FPS}"
    )


# (name, start, end, speed, extra filters)
SECTIONS = [
    ("intro", 0.05, 3.25, 1.0, ""),
    ("landing", M["landing"] + 0.05, M["landing"] + 1.15, 1.0, ""),
    ("typing", M["typing"], M["typed"] + 0.35, 1.45, push(1.3, 60, 0.05, 0.62)),
    ("connect", M["confirm"] + 0.1, M["scan"] - 0.05, 2.0, ""),
    ("scan", M["scan"], M["ready"] + 0.75, 1.7, caption("SCAN YOUR SAVED WORLD", 0.3, 3.0, cx="760")),
    ("reveal", M["reveal"], M["revealDone"] + 0.2, 1.0, push(1.07, 112, 0.25, 0.35) + "," + caption("DISCOVER YOUR BOOKMARK DNA", 2.2, 1.6)),
    ("badges", M["revealDone"] + 0.2, M["revealScrolled"] - 0.05, 1.3, caption("UNLOCK YOUR BADGES", 0.35, 1.3)),
    ("dashboard", M["dashboard"] + 0.15, M["dashboard"] + 1.55, 1.0, ""),
    ("topics", M["topics"] + 0.1, M["topics"] + 1.4, 1.0, ""),
    ("library", M["library"] + 0.1, M["searched"] - 0.1, 1.45, ""),
    ("share", M["share"] - 0.2, M["shareEnd"] - 0.1, 1.2, caption("SHARE YOUR RESULT", 0.2, 2.2)),
    ("outro", M["outro"] + 0.05, M["end"], 1.0, "tpad=stop_mode=clone:stop_duration=0.8"),
]


def run(cmd: list[str]) -> None:
    subprocess.run(cmd, check=True)


parts, timeline, t = [], [], 0.0
for i, (name, a, b, speed, extra) in enumerate(SECTIONS):
    out = D / f"seg_{i:02d}_{name}.mp4"
    vf = f"trim=start={a:.3f}:end={b:.3f},setpts=(PTS-STARTPTS)/{speed},fps={FPS}"
    if extra:
        vf += "," + extra
    run(["ffmpeg", "-v", "error", "-y", "-i", str(D / "master.mp4"), "-vf", vf, "-an", "-c:v", "libx264", "-preset", "medium", "-crf", "15", "-pix_fmt", "yuv420p", str(out)])
    dur = float(subprocess.check_output(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(out)]))
    timeline.append({"name": name, "start": round(t, 3), "dur": round(dur, 3), "speed": speed, "src": [round(a, 3), round(b, 3)]})
    parts.append((out, dur))
    t += dur - (XF if i < len(SECTIONS) - 1 else 0)

# Crossfade chain
inputs, chain, last, offset = [], [], "[0:v]", 0.0
for i, (p, dur) in enumerate(parts):
    inputs += ["-i", str(p)]
for i in range(1, len(parts)):
    offset += parts[i - 1][1] - XF
    nxt = f"[v{i}]"
    chain.append(f"{last}[{i}:v]xfade=transition=fade:duration={XF}:offset={offset:.3f}{nxt}")
    last = nxt
total = offset + parts[-1][1]
chain.append(f"{last}fade=t=in:st=0:d=0.25,fade=t=out:st={total - 0.6:.3f}:d=0.6[vout]")
run(["ffmpeg", "-v", "error", "-y", *inputs, "-filter_complex", ";".join(chain), "-map", "[vout]", "-c:v", "libx264", "-preset", "slow", "-crf", "17", "-pix_fmt", "yuv420p", "-r", str(FPS), str(D / "video_only.mp4")])
(D / "timeline.json").write_text(json.dumps({"total": round(total, 3), "sections": timeline}, indent=1))
print(json.dumps({"total": round(total, 2), "sections": [(s["name"], s["start"], s["dur"]) for s in timeline]}))
