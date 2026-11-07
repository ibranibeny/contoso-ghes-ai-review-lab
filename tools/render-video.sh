#!/usr/bin/env bash
# Render the demo video: scene stills (headless Chrome) + narration (WAV) -> MP4 with fades, WebVTT captions.
set -euo pipefail
B=docs/video/build; mkdir -p "$B" docs/media
PAD=0.7
CHROME=$(command -v google-chrome || command -v chromium || command -v chromium-browser)
python3 - <<'PY'
import json
t = json.load(open("docs/video/build/timings.json"))
s = json.load(open("docs/video/scenes.json"))["scenes"]
pad = 0.7; clock = 0.0; vtt = ["WEBVTT", ""]; chapters = []
def ts(x):
    h, r = divmod(x, 3600); m, s_ = divmod(r, 60)
    return f"{int(h):02d}:{int(m):02d}:{s_:06.3f}"
for sc in s:
    d = t[sc["id"]]
    chapters.append({"id": sc["id"], "title": sc.get("chapter", sc.get("title", "")), "start": round(clock, 2)})
    for c in d["cues"]:
        vtt += [f"{ts(clock + c['start'])} --> {ts(clock + c['end'])}", c["text"], ""]
    clock += d["duration"] + pad
open("docs/media/demo.vtt", "w").write("\n".join(vtt))
json.dump({"duration": round(clock, 1), "chapters": chapters}, open("docs/media/chapters.json", "w"), indent=1)
open("docs/video/build/list.txt", "w").write("".join(f"{x['id']}\n" for x in s))
PY
: > "$B/concat.txt"
# note: Chrome and ffmpeg both read stdin, so stdin is closed for them and the scene list is iterated with a for loop
for id in $(cat "$B/list.txt"); do
  "$CHROME" --headless=new --disable-gpu --hide-scrollbars --force-device-scale-factor=1 --window-size=1920,1080 \
    --virtual-time-budget=4000 --allow-file-access-from-files --screenshot="$PWD/$B/$id.png" \
    "file://$PWD/docs/video/scene.html?id=$id" >/dev/null 2>&1 < /dev/null
  D=$(python3 -c "import json;print(json.load(open('$B/timings.json'))['$id']['duration'] + $PAD)")
  ffmpeg -nostdin -y -loglevel error -loop 1 -framerate 30 -i "$B/$id.png" -i "$B/$id.wav" \
    -filter_complex "[0:v]scale=1920:1080,format=yuv420p,fade=t=in:st=0:d=0.35,fade=t=out:st=$(python3 -c "print($D-0.35)"):d=0.35[v];[1:a]apad=pad_dur=$PAD,aresample=48000[a]" \
    -map "[v]" -map "[a]" -t "$D" -c:v libx264 -preset medium -crf 20 -tune stillimage -r 30 \
    -c:a aac -b:a 160k -ac 2 "$B/$id.mp4"
  echo "file '$id.mp4'" >> "$B/concat.txt"
  echo "scene $id: ${D}s"
done
ffmpeg -nostdin -y -loglevel error -f concat -safe 0 -i "$B/concat.txt" -c copy -movflags +faststart docs/media/demo.mp4
cp "$B/s01.png" docs/media/demo-poster.png 2>/dev/null || true
ls -la docs/media
