#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
OUT_DIR="$ROOT_DIR/marketing/linkedin"
OUT_FILE="$OUT_DIR/aria-linkedin-cinematic.mp4"
FONT_FILE="/System/Library/Fonts/Avenir Next.ttc"

mkdir -p "$OUT_DIR"
node "$ROOT_DIR/scripts/generate-linkedin-title-cards.mjs"

ffmpeg -hide_banner -y \
  -ss 0 -t 4 -i "$ROOT_DIR/public/landing/media/intro.mp4" \
  -ss 17 -t 4 -i "$ROOT_DIR/public/landing/media/intro.mp4" \
  -ss 115 -t 3.5 -i "$ROOT_DIR/public/Demo-new.mp4" \
  -ss 295 -t 3.5 -i "$ROOT_DIR/public/Demo-new.mp4" \
  -ss 415 -t 3.5 -i "$ROOT_DIR/public/Demo-new.mp4" \
  -ss 535 -t 3.5 -i "$ROOT_DIR/public/Demo-new.mp4" \
  -ss 655 -t 3.5 -i "$ROOT_DIR/public/Demo-new.mp4" \
  -ss 2 -t 4.5 -i "$ROOT_DIR/public/landing/media/sectors/autonomy.mp4" \
  -loop 1 -t 7.5 -i "$ROOT_DIR/public/landing/social/aria-linkedin-launch-artwork.png" \
  -i "$ROOT_DIR/public/landing/media/intro.mp4" \
  -loop 1 -t 37.5 -i "$OUT_DIR/title-cards/card-0.png" \
  -loop 1 -t 37.5 -i "$OUT_DIR/title-cards/card-1.png" \
  -loop 1 -t 37.5 -i "$OUT_DIR/title-cards/card-2.png" \
  -loop 1 -t 37.5 -i "$OUT_DIR/title-cards/card-3.png" \
  -loop 1 -t 37.5 -i "$OUT_DIR/title-cards/card-4.png" \
  -loop 1 -t 37.5 -i "$OUT_DIR/title-cards/card-5.png" \
  -loop 1 -t 37.5 -i "$OUT_DIR/title-cards/card-6.png" \
  -loop 1 -t 37.5 -i "$OUT_DIR/title-cards/card-7.png" \
  -loop 1 -t 37.5 -i "$OUT_DIR/title-cards/card-8.png" \
  -filter_complex "
    [0:v]scale=1080:1350:force_original_aspect_ratio=increase,crop=1080:1350,
      eq=brightness=-0.08:saturation=1.18,
      drawbox=x=0:y=0:w=iw:h=ih:color=black@0.18:t=fill[0base];
    [0base][10:v]overlay=0:0:shortest=1,setsar=1,fps=30,format=yuv420p[v0];
    [1:v]scale=1080:1350:force_original_aspect_ratio=increase,crop=1080:1350,
      eq=brightness=-0.06:saturation=1.2,
      drawbox=x=0:y=0:w=iw:h=ih:color=black@0.12:t=fill[1base];
    [1base][11:v]overlay=0:0:shortest=1,setsar=1,fps=30,format=yuv420p[v1];
    [2:v]split=2[2bg][2fg];
    [2bg]scale=1080:1350:force_original_aspect_ratio=increase,crop=1080:1350,boxblur=24:2,eq=brightness=-0.5:saturation=1.25[2b];
    [2fg]scale=1000:550:force_original_aspect_ratio=decrease[2f];
    [2b][2f]overlay=(W-w)/2:390,drawbox=x=30:y=365:w=1020:h=600:color=0x65E9FF@0.22:t=2[2base];
    [2base][12:v]overlay=0:0:shortest=1,setsar=1,fps=30,format=yuv420p[v2];
    [3:v]split=2[3bg][3fg];
    [3bg]scale=1080:1350:force_original_aspect_ratio=increase,crop=1080:1350,boxblur=24:2,eq=brightness=-0.5:saturation=1.25[3b];
    [3fg]scale=1000:550:force_original_aspect_ratio=decrease[3f];
    [3b][3f]overlay=(W-w)/2:390,drawbox=x=30:y=365:w=1020:h=600:color=0x65E9FF@0.22:t=2[3base];
    [3base][13:v]overlay=0:0:shortest=1,setsar=1,fps=30,format=yuv420p[v3];
    [4:v]split=2[4bg][4fg];
    [4bg]scale=1080:1350:force_original_aspect_ratio=increase,crop=1080:1350,boxblur=24:2,eq=brightness=-0.5:saturation=1.25[4b];
    [4fg]scale=1000:550:force_original_aspect_ratio=decrease[4f];
    [4b][4f]overlay=(W-w)/2:390,drawbox=x=30:y=365:w=1020:h=600:color=0x65E9FF@0.22:t=2[4base];
    [4base][14:v]overlay=0:0:shortest=1,setsar=1,fps=30,format=yuv420p[v4];
    [5:v]split=2[5bg][5fg];
    [5bg]scale=1080:1350:force_original_aspect_ratio=increase,crop=1080:1350,boxblur=24:2,eq=brightness=-0.5:saturation=1.25[5b];
    [5fg]scale=1000:550:force_original_aspect_ratio=decrease[5f];
    [5b][5f]overlay=(W-w)/2:390,drawbox=x=30:y=365:w=1020:h=600:color=0xFF477D@0.25:t=2[5base];
    [5base][15:v]overlay=0:0:shortest=1,setsar=1,fps=30,format=yuv420p[v5];
    [6:v]split=2[6bg][6fg];
    [6bg]scale=1080:1350:force_original_aspect_ratio=increase,crop=1080:1350,boxblur=24:2,eq=brightness=-0.5:saturation=1.25[6b];
    [6fg]scale=1000:550:force_original_aspect_ratio=decrease[6f];
    [6b][6f]overlay=(W-w)/2:390,drawbox=x=30:y=365:w=1020:h=600:color=0x65E9FF@0.22:t=2[6base];
    [6base][16:v]overlay=0:0:shortest=1,setsar=1,fps=30,format=yuv420p[v6];
    [7:v]scale=1080:1350:force_original_aspect_ratio=increase,crop=1080:1350,
      eq=brightness=-0.13:saturation=1.25,
      drawbox=x=0:y=0:w=iw:h=ih:color=black@0.16:t=fill[7base];
    [7base][17:v]overlay=0:0:shortest=1,setsar=1,fps=30,format=yuv420p[v7];
    [8:v]scale=1080:1350:force_original_aspect_ratio=increase,crop=1080:1350,
      eq=brightness=-0.22:saturation=1.15,
      drawbox=x=0:y=0:w=iw:h=ih:color=black@0.25:t=fill[8base];
    [8base][18:v]overlay=0:0:shortest=1,setsar=1,fps=30,format=yuv420p[v8];
    [v0][v1][v2][v3][v4][v5][v6][v7][v8]concat=n=9:v=1:a=0,
      fade=t=in:st=0:d=0.4,fade=t=out:st=36.8:d=0.7[v];
    [9:a]atrim=0:37.5,afade=t=in:st=0:d=0.8,afade=t=out:st=35.5:d=2,
      volume=0.9[a]
  " \
  -map "[v]" -map "[a]" \
  -c:v libx264 -preset medium -crf 18 -profile:v high -level 4.1 \
  -c:a aac -b:a 192k -ar 48000 \
  -movflags +faststart -shortest \
  "$OUT_FILE"

printf '%s\n' "$OUT_FILE"
