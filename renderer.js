// =================== imports ===================
import * as PIXI from './node_modules/pixi.js/dist/pixi.min.mjs';
const vision = await import(new URL('./node_modules/@mediapipe/tasks-vision/vision_bundle.mjs', import.meta.url));
const { FaceLandmarker, FilesetResolver } = vision;
import { EMA } from './filters.js';

// =================== constants ===================
const W = 1280, H = 720;

// 화면 기준
const BASELINE_X = W * 0.50;
const BASELINE_Y = H * 0.45;

// ▼ 아바타를 화면에서 "더 위로" 올리는 오프셋(음수일수록 위로)
const VERTICAL_BIAS = -80;          // px  (-40 ~ -120 사이 취향대로)

// ▼ 더 멀게(작게) 보이도록 스케일 계수(작을수록 멈)
const DISTANCE_SCALE = 0.70;        // 0.65~0.85 추천

// 헤드 모션 게인
const HEAD_YAW_X_GAIN   = 3.0;      // px/deg (좌우)
const HEAD_PITCH_Y_GAIN = 2.0;      // px/deg (상하)
const HEAD_ROLL_ROT_GAIN= 0.25;     // 회전 강도

// 깜박임 방향(감았는데 캐릭터가 뜨면 true로)
const BLINK_INVERT = true;

// =================== HUD ===================
const hudEl = document.getElementById('hud');
const _log = console.log.bind(console), _err = console.error.bind(console);
console.log = (...a)=>{ _log(...a); if (hudEl) hudEl.textContent = a.join(' '); };
console.error = (...a)=>{ _err(...a); if (hudEl) hudEl.textContent = 'ERR: ' + a.join(' '); };
console.log('Booting...');

// =================== Pixi v8 init ===================
const app = new PIXI.Application();
await app.init({ width: W, height: H, background: '#222', antialias: true });
document.body.appendChild(app.canvas);

// =================== Avatar texture ===================
let avatarTex;
try {
  avatarTex = await PIXI.Assets.load('./avatar.png');
} catch {
  console.error('avatar.png not found at project root');
}

// =================== Scene graph ===================
const avatarRoot = new PIXI.Container();
avatarRoot.position.set(BASELINE_X, BASELINE_Y + VERTICAL_BIAS);  // ▲ 기본부터 위로
app.stage.addChild(avatarRoot);

const avatar = new PIXI.Sprite(avatarTex);
avatar.anchor.set(0.5);
avatar.scale.set(1);
avatarRoot.addChild(avatar);

// =================== Eyes & Mouth ===================
class Eye extends PIXI.Container {
  constructor({ scleraW=32, scleraH=16, irisR=7, pupilR=3.5, irisColor=0x39a2ff }={}) {
    super();
    const sclera = new PIXI.Graphics();
    sclera.beginFill(0xFFFFFF); sclera.drawEllipse(0,0,scleraW,scleraH); sclera.endFill();
    this.addChild(sclera);

    this.iris = new PIXI.Graphics();
    this.iris.beginFill(irisColor); this.iris.drawCircle(0,0,irisR); this.iris.endFill();
    this.addChild(this.iris);

    this.pupil = new PIXI.Graphics();
    this.pupil.beginFill(0x000000); this.pupil.drawCircle(0,0,pupilR); this.pupil.endFill();
    this.addChild(this.pupil);

    this.hl = new PIXI.Graphics();
    this.hl.beginFill(0xFFFFFF); this.hl.drawCircle(-irisR*0.3,-irisR*0.3,Math.max(2,pupilR*0.35)); this.hl.endFill();
    this.addChild(this.hl);

    this.eyelid = new PIXI.Graphics();
    this.addChild(this.eyelid);

    this.scleraW = scleraW; this.scleraH = scleraH;
    this._base = {x:0, y:0};
  }
  // b: 0(열림) ~ 1(감김)
  setBlink(b){
    const h = this.scleraH*2;
    const yTop = -this.scleraH - h*b;
    this.eyelid.clear();
    this.eyelid.beginFill(0x222222);
    this.eyelid.drawRect(-this.scleraW-2, yTop, (this.scleraW+2)*2, h);
    this.eyelid.endFill();
  }
  setGaze(nx,ny){
    const r=6, gx=r*nx, gy=r*ny;
    this.iris.position.set(this._base.x+gx, this._base.y+gy);
    this.pupil.position.set(this._base.x+gx, this._base.y+gy);
    this.hl.position.set(this._base.x+gx-3, this._base.y+gy-3);
  }
}
class Mouth extends PIXI.Container {
  constructor({ w=120, h=28 }={}){ super(); this.w=w; this.h=h; this.g=new PIXI.Graphics(); this.addChild(this.g); }
  draw(open, smile=0){
    const g=this.g, w=this.w, h=this.h*(0.2+0.8*open);
    g.clear(); g.lineStyle(8,0x222222,1); g.beginFill(0xff5a76,1);
    g.moveTo(-w/2,0);
    g.bezierCurveTo(-w/3, h*(0.6+0.4*smile),  w/3, h*(0.6+0.4*smile),  w/2,0);
    g.bezierCurveTo( w/3,-h*(0.6-0.4*smile), -w/3,-h*(0.6-0.4*smile), -w/2,0);
    g.closePath(); g.endFill();
  }
}

const eyeL = new Eye({ scleraW:32, scleraH:16, irisR:7, pupilR:3.5 });
const eyeR = new Eye({ scleraW:32, scleraH:16, irisR:7, pupilR:3.5 });
const mouth = new Mouth({ w:120, h:28 });
avatarRoot.addChild(eyeL, eyeR, mouth);

// =================== Anchors (비율) ===================
// 눈을 조금 더 위로
const AVATAR_ANCHOR = {
  eyeL : { u: 0.44, v: 0.43 },
  eyeR : { u: 0.56, v: 0.43 },
  mouth: { u: 0.50, v: 0.60 }
};
function localFromUV(u,v){ const w=avatar.width, h=avatar.height; return { x:(u-0.5)*w, y:(v-0.5)*h }; }
function placeFacialParts(){
  const pL=localFromUV(AVATAR_ANCHOR.eyeL.u,AVATAR_ANCHOR.eyeL.v);
  const pR=localFromUV(AVATAR_ANCHOR.eyeR.u,AVATAR_ANCHOR.eyeR.v);
  const pM=localFromUV(AVATAR_ANCHOR.mouth.u,AVATAR_ANCHOR.mouth.v);
  eyeL.position.set(pL.x,pL.y); eyeR.position.set(pR.x,pR.y); mouth.position.set(pM.x,pM.y);
}
placeFacialParts();

// =================== Camera ===================
const cam = document.getElementById('cam');
try {
  const stream = await navigator.mediaDevices.getUserMedia({ video:{ width:W, height:H }, audio:false });
  cam.srcObject = stream; await cam.play();
  console.log('[cam] started');
} catch (e) { console.error('[cam]', e?.name || e); }

// =================== MediaPipe ===================
const WASM_DIR   = 'http://127.0.0.1:5173/mediapipe/wasm';
const MODEL_PATH = 'http://127.0.0.1:5173/mediapipe/face_landmarker.task';
const fileset    = await FilesetResolver.forVisionTasks(WASM_DIR);
const landmarker = await FaceLandmarker.createFromOptions(fileset, {
  baseOptions: { modelAssetPath: MODEL_PATH },
  runningMode: 'VIDEO',
  numFaces: 1,
  outputFaceBlendshapes: true,
  outputFacialTransformationMatrixes: true
});
console.log('[mp] model loaded');

// =================== Smoothers ===================
const fEyeL=new EMA(0.25), fEyeR=new EMA(0.25), fMouth=new EMA(0.20);
const fYaw=new EMA(0.18), fPitch=new EMA(0.18), fRoll=new EMA(0.18);
const fScale=new EMA(0.25);

// =================== Helpers ===================
const L_SET=[159,145,133,153], R_SET=[386,374,362,380];
const IDX={ LEFT:234, RIGHT:454, UP:10, DOWN:152 };
function centerAvg(idxs,lm){ let x=0,y=0; for(const i of idxs){ x+=lm[i].x; y+=lm[i].y; } return { x:x/idxs.length*W, y:y/idxs.length*H }; }
function approxPose(lm){ const yaw=(lm[IDX.RIGHT].x-lm[IDX.LEFT].x)*90; const pitch=(lm[IDX.DOWN].y-lm[IDX.UP].y)*130; const roll=(lm[IDX.LEFT].y-lm[IDX.RIGHT].y)*180; return {yaw,pitch,roll}; }
function clamp(x,a,b){ return Math.min(b, Math.max(a,x)); }
function clamp01(x){ return clamp(x, 0, 1); }

// =================== Base eye distance ===================
const BASE={};
(function(){
  const w0=avatarTex.width, h0=avatarTex.height;
  const L0={x:(AVATAR_ANCHOR.eyeL.u-0.5)*w0, y:(AVATAR_ANCHOR.eyeL.v-0.5)*h0};
  const R0={x:(AVATAR_ANCHOR.eyeR.u-0.5)*w0, y:(AVATAR_ANCHOR.eyeR.v-0.5)*h0};
  BASE.eyeDist=Math.hypot(R0.x-L0.x,R0.y-L0.y)||1;
})();

// =================== Auto-calibration ===================
let calibrated=false;
function autoCalibrate(lm){
  const L=centerAvg(L_SET,lm), R=centerAvg(R_SET,lm);
  const camDist=Math.hypot(R.x-L.x,R.y-L.y)||1;

  // 절대 스케일 × 거리계수(멀리)
  const targetScale=clamp((camDist/BASE.eyeDist) * DISTANCE_SCALE, 0.30, 1.8);
  avatar.scale.set(fScale.apply(targetScale));
  placeFacialParts();

  // 기준 위치·회전 (위쪽 바이어스 포함)
  avatarRoot.position.set(BASELINE_X, BASELINE_Y + VERTICAL_BIAS);
  avatarRoot.rotation = 0;

  calibrated=true; console.log('[calib] scale=',targetScale.toFixed(3));
}

// =================== Debug overlay ===================
const overlayCanvas=document.getElementById('overlay');
const dctx=overlayCanvas.getContext('2d');

// =================== Reset (R) ===================
window.addEventListener('keydown', e=>{
  if(e.key.toLowerCase()==='r'){
    calibrated=false;
    avatar.scale.set(1);
    avatarRoot.rotation=0;
    avatarRoot.position.set(BASELINE_X, BASELINE_Y + VERTICAL_BIAS);
    placeFacialParts();
    console.log('[reset] rig');
  }
});

// =================== Main loop ===================
async function loop(){
  const t0=performance.now();
  try{
    const res=await landmarker.detectForVideo(cam, t0);
    if(res.faceLandmarks && res.faceLandmarks[0]){
      const lm=res.faceLandmarks[0];
      if(!calibrated) autoCalibrate(lm);

      // ---- Blendshapes ----
      const bs=res.faceBlendshapes?.[0]?.categories || [];
      const get=(n)=>bs.find(b=>b.categoryName===n)?.score ?? 0;

      // 깜박임 (방향 토글 포함)
      const rawCloseL = clamp01(get('eyeBlinkLeft')  + 0.2*get('eyeSquintLeft'));
      const rawCloseR = clamp01(get('eyeBlinkRight') + 0.2*get('eyeSquintRight'));
      const closedL   = BLINK_INVERT ? (1 - rawCloseL) : rawCloseL;
      const closedR   = BLINK_INVERT ? (1 - rawCloseR) : rawCloseR;
      eyeL.setBlink(fEyeL.apply(closedL));
      eyeR.setBlink(fEyeR.apply(closedR));

      // 시선
      const gazeX=( get('eyeLookOutLeft')-get('eyeLookInLeft')
                  + get('eyeLookInRight')-get('eyeLookOutRight') )*0.6;
      const gazeY=( get('eyeLookDownLeft')+get('eyeLookDownRight')
                  - get('eyeLookUpLeft')  -get('eyeLookUpRight')  )*0.6;
      eyeL.setGaze(gazeX,gazeY); eyeR.setGaze(gazeX,gazeY);

      // 입
      const open = fMouth.apply(get('jawOpen'));
      const smile=(get('mouthSmileLeft')+get('mouthSmileRight'))*0.5 - 0.2*get('mouthFrownLeft');
      mouth.draw(open, smile);

      // ---- Head motion ----
      const {yaw,pitch,roll}=approxPose(lm);
      const yawS  = fYaw.apply(yaw);
      const pitchS= fPitch.apply(pitch);
      const rollS = fRoll.apply(roll);

      avatarRoot.x = BASELINE_X + yawS   * HEAD_YAW_X_GAIN;
      // ▲ 위쪽 바이어스 포함
      avatarRoot.y = BASELINE_Y + VERTICAL_BIAS + pitchS * HEAD_PITCH_Y_GAIN;
      avatarRoot.rotation = (-rollS * Math.PI/180) * HEAD_ROLL_ROT_GAIN;

      // overlay
      dctx.clearRect(0,0,overlayCanvas.width, overlayCanvas.height);
      dctx.fillStyle='#0f8';
      for(const p of lm) dctx.fillRect(p.x*overlayCanvas.width-1, p.y*overlayCanvas.height-1, 2,2);

      console.log(`OK fps≈${(1000/(performance.now()-t0)).toFixed(0)}`);
    }
  }catch(e){ console.error('[loop]', e.message || e); }
  requestAnimationFrame(loop);
}
loop();
