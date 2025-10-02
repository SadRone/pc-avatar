# pc-avatar
pc-avatar — 2D Face-Tracked Avatar (Electron + PixiJS + MediaPipe)

OVERVIEW
pc-avatar is a desktop app that tracks your face from a webcam and drives a 2D avatar in real time. It uses MediaPipe Face Landmarker (Blendshapes) for blink, gaze, and mouth motion, renders with PixiJS v8, and runs in Electron.

KEY FEATURES

Real-time webcam capture (Electron auto-grants media permission)

MediaPipe Face Landmarker (Tasks) blendshapes:
Blink, Squint, EyeLook (Up/Down/In/Out), JawOpen, MouthSmile, etc.

Vector eyes and mouth layered on top of your avatar PNG

One-shot auto-calibration (absolute scale from eye-to-eye distance)

Simple tuning knobs in renderer.js:
VERTICAL_BIAS (lift avatar higher), DISTANCE_SCALE (further/closer),
BLINK_INVERT (invert blink direction), HEAD_*_GAIN (head motion),
AVATAR_ANCHOR (facial anchors as UV percentages)

Keyboard: R resets rig (scale, rotation, position)

REQUIREMENTS

Node.js 18 or newer

Windows or macOS

A webcam

PROJECT LAYOUT
pc-avatar/
package.json
main.js
preload.cjs
public/
index.html
renderer.js
avatar.png
mediapipe/
face_landmarker.task
wasm/ (wasm files + JS glue)
.github/workflows/ (optional CI/CD)

IMPORTANT
MediaPipe Tasks web assets must be served over HTTP, not file://. Place face_landmarker.task and the entire wasm/ folder under public/mediapipe/. Electron’s small static server (in main.js) serves public/ at http://127.0.0.1:5173
, and renderer.js fetches the model and wasm from that URL.

INSTALL

Install dependencies:
npm install

Run the app:
npm start
(If the electron command is not found, try: npx electron .)

Windows note: If the camera is black, enable OS camera permissions:
Settings → Privacy & security → Camera → allow apps and desktop apps.

PACKAGE.JSON SCRIPTS (minimum)
"scripts": {
"start": "electron .",
"dev": "npx electron .",
"check": "node -e "console.log('ok')""
}

TUNING (edit public/renderer.js)

VERTICAL_BIAS (negative lifts the avatar up). Example: -80 (range -40 to -120).

DISTANCE_SCALE (smaller makes the avatar appear further). Example: 0.70 (range 0.65 to 0.85).

BLINK_INVERT (true if your real blink looks reversed on the avatar).

HEAD_YAW_X_GAIN, HEAD_PITCH_Y_GAIN, HEAD_ROLL_ROT_GAIN to adjust head motion speed and range.

AVATAR_ANCHOR to align eyes and mouth by UV percentages (0..1) so it works regardless of PNG size. Smaller v means higher on the face.

MINIMAL INDEX.HTML CONTENTS
You must include these elements for the renderer:

<video id="cam" autoplay playsinline muted style="display:none"></video>

<div id="hud"> for on-screen logs

<canvas id="overlay"> for landmark debug (optional)

<script type="module" src="./renderer.js"></script>

ELECTRON MAIN (concept)

Serve public/ via an embedded HTTP server at 127.0.0.1:5173 (serve-handler recommended)

session.defaultSession.setPermissionRequestHandler: return true for "media"

Use contextIsolation: true and nodeIntegration: false

Load public/index.html into BrowserWindow

GIT IGNORE (recommended)
node_modules/
npm-debug.log*
yarn.lock
pnpm-lock.yaml
package-lock.json
.DS_Store
Thumbs.db
dist/
out/
.cache/
*.log
*.asar

PUSH TO GITHUB (example for user SadRone)
git init
git add .
git commit -m "Initial commit: pc-avatar (Electron+Pixi+MediaPipe)"
git branch -M main
git remote add origin https://github.com/SadRone/pc-avatar.git

git push -u origin main

CI (GITHUB ACTIONS) — SIMPLE SMOKE TEST
Create .github/workflows/ci.yml with:
name: CI
on:
push:
pull_request:
jobs:
build:
name: Build (Node 18)
runs-on: ${{ matrix.os }}
strategy:
matrix:
os: [ubuntu-latest, windows-latest, macos-latest]
steps:
- uses: actions/checkout@v4
- uses: actions/setup-node@v4
with:
node-version: 18
- run: npm ci
- run: npx electron --version
- run: npm run check

OPTIONAL CD (PACKAGING INSTALLERS WITH ELECTRON-BUILDER)

Install: npm i -D electron-builder

package.json (add build target):
"build": {
"appId": "com.sadrone.pcvatar",
"productName": "PC Avatar",
"files": ["main.js","preload.cjs","package.json","public//*"],
"extraResources": ["public/mediapipe//*"],
"mac": { "target": ["dmg"] },
"win": { "target": ["nsis"] },
"linux": { "target": ["AppImage"] }
}
Add script: "build": "electron-builder --publish never"

GitHub Actions workflow for tagged releases (.github/workflows/release.yml):
name: Release
on:
push:
tags:

'v*..'
jobs:
build:
runs-on: ${{ matrix.os }}
strategy:
matrix:
os: [ubuntu-latest, windows-latest, macos-latest]
steps:

uses: actions/checkout@v4

uses: actions/setup-node@v4
with:
node-version: 18

run: npm ci

run: npm run build

uses: actions/upload-artifact@v4
with:
name: pc-avatar-${{ matrix.os }}
path: dist/**

To auto-upload to GitHub Releases, set build to “--publish always” and add GH_TOKEN as a repo secret under Settings → Secrets and variables → Actions.

AVATAR IMAGE TIPS

Transparent PNG recommended (front-facing, 800–1500 px on a side)

Avoid hair or hats that cover the eyes (tracking quality)

Real photos work, but respect copyright and portrait rights

SHORTCUTS

R resets rig (scale, rotation, position)

TROUBLESHOOTING

Electron command not found: use npx electron . or verify the start script.

Camera black or no prompt: check OS permissions, ensure Electron’s HTTP server is running, and confirm renderer.js URLs point to http://127.0.0.1:5173/mediapipe/
...

WASM runtime errors: serve over HTTP, not file://; ensure all wasm files and the loader JS are present in public/mediapipe/wasm/; clear cache and reload.

Blink direction reversed: toggle BLINK_INVERT in renderer.js.

Avatar too low or too close: adjust VERTICAL_BIAS (more negative is higher) and DISTANCE_SCALE (smaller is further).

Eyes or mouth misaligned: fine-tune AVATAR_ANCHOR. Since anchors are UV percentages, they adapt to any PNG size.

LICENSE
Choose a license appropriate for your use (e.g., MIT). MediaPipe assets are under their respective licenses; review Google’s license terms for redistribution.
