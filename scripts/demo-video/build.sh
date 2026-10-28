#!/usr/bin/env bash
# Rebuilds artifacts/bkmk-demo.mp4 from the real app. Needs: node deps in
# frontend/, Chromium, ffmpeg (libx264, aac), python3 + numpy, and the demo-only
# frontend running on :5175 (see record.mjs).
set -euo pipefail
cd "$(dirname "$0")"
node record.mjs
python3 - <<'PY'
import json
d=json.load(open('frames.json')); f=d['frames']; t0=f[0]['t']
with open('frames.txt','w') as o:
    for a,b in zip(f,f[1:]): o.write(f"file 'frames/{a['n']:05d}.jpg'\nduration {max(0.001,b['t']-a['t']):.4f}\n")
    o.write(f"file 'frames/{f[-1]['n']:05d}.jpg'\nduration 0.5\nfile 'frames/{f[-1]['n']:05d}.jpg'\n")
json.dump({k: round(v-t0,3) for k,v in d['markers'].items()}, open('markers.json','w'), indent=1)
PY
ffmpeg -v error -y -f concat -safe 0 -i frames.txt -vf "fps=30,scale=1920:1080:flags=lanczos,unsharp=5:5:0.45:5:5:0" -c:v libx264 -preset slow -crf 14 -pix_fmt yuv420p master.mp4
python3 edit.py
python3 music.py
mkdir -p ../../artifacts
ffmpeg -v error -y -i video_only.mp4 -i soundtrack.wav -filter_complex \
  "[0:v]scale=in_range=pc:out_range=tv:out_color_matrix=bt709,format=yuv420p[v];[1:a]loudnorm=I=-14:TP=-1.5:LRA=11,alimiter=limit=0.82:level=false,aresample=48000[a]" \
  -map "[v]" -map "[a]" -c:v libx264 -profile:v high -preset slow -crf 18 -r 30 -g 60 -color_range tv -colorspace bt709 -color_primaries bt709 -color_trc bt709 \
  -c:a aac -b:a 192k -ar 48000 -shortest -movflags +faststart ../../artifacts/bkmk-demo.mp4
ffmpeg -v error -y -ss 15.6 -i ../../artifacts/bkmk-demo.mp4 -frames:v 1 ../../artifacts/bkmk-demo-thumbnail.png
ffmpeg -v error -y -ss 26.8 -i ../../artifacts/bkmk-demo.mp4 -frames:v 1 ../../artifacts/bkmk-demo-poster.png
echo "done: artifacts/bkmk-demo.mp4"
