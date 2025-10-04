const clamp01 = (v) => Math.max(0, Math.min(1, v));
const getScore = (arr, name) => (arr?.find(b => b.categoryName === name)?.score) ?? 0;

export function mapBlendshapesToParams(categories) {
  const eyeL = 1 - Math.min(1, getScore(categories,'eyeBlinkLeft')  + 0.2*getScore(categories,'eyeSquintLeft'));
  const eyeR = 1 - Math.min(1, getScore(categories,'eyeBlinkRight') + 0.2*getScore(categories,'eyeSquintRight'));
  const jawOpen = getScore(categories,'jawOpen');
  const smile   = Math.max(getScore(categories,'mouthSmileLeft'), getScore(categories,'mouthSmileRight'));
  const funnel  = getScore(categories,'mouthFunnel');
  const pucker  = getScore(categories,'mouthPucker');

  return {
    eye: { L: clamp01(eyeL), R: clamp01(eyeR) },
    mouth: {
      open: clamp01(jawOpen),
      viseme: {
        A: clamp01(jawOpen),        // '아'
        I: clamp01(smile*0.8),      // '이'
        U: clamp01(Math.max(funnel, pucker)*0.9) // '우/오'
      }
    }
  };
}
