// 八音盒版《Happy Birthday》：不用音频文件，全部用 Web Audio 现场合成。
// 默认不响，只有她点了音乐按钮才开始；再点一下就停。
//
// 每个音 = 一个正弦波基音 + 两个很快消失的高泛音（八音盒簧片"叮"的那一下），
// 再加一点短回声，听起来像在小盒子里。

const BEAT = 0.6; // 每拍秒数（约 100 bpm）
const GAP = 2.5; // 每遍之间停一下
const VOLUME = 0.22;

// 旋律（F 大调，MIDI 音高, 拍数）。第一小节是弱起的两个音
const MELODY = [
  [72, 0.75], [72, 0.25],
  [74, 1], [72, 1], [77, 1],
  [76, 2], [72, 0.75], [72, 0.25],
  [74, 1], [72, 1], [79, 1],
  [77, 2], [72, 0.75], [72, 0.25],
  [84, 1], [81, 1], [77, 1],
  [76, 1], [74, 1], [82, 0.75], [82, 0.25],
  [81, 1], [77, 1], [79, 1],
  [77, 3],
];

// 伴奏和弦：[根音, [第 2、3 拍的两个音]]，每小节一个（弱起那一拍没有伴奏）
const F = [65, [69, 72]];
const C = [60, [64, 67]];
const Bb = [58, [62, 65]];
const CHORDS = [F, C, C, F, F, Bb, F, F];

const PICKUP = 1;
const LENGTH = (PICKUP + CHORDS.length * 3) * BEAT + 0.6; // 最后一拍放慢一点

const freq = (midi) => 440 * 2 ** ((midi - 69) / 12);

export function createMusic() {
  let ctx = null;
  let master = null;
  let passes = []; // 每一遍的总音量，停的时候全部淡出
  let nextStart = 0;
  let timer = 0;
  let on = false;

  function setup() {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = VOLUME;
    master.connect(ctx.destination);
    // 短回声：延迟 0.21 秒，反馈很少，高频滤掉一些
    const delay = ctx.createDelay(1);
    delay.delayTime.value = 0.21;
    const feedback = ctx.createGain();
    feedback.gain.value = 0.25;
    const tone = ctx.createBiquadFilter();
    tone.type = 'lowpass';
    tone.frequency.value = 3000;
    const wet = ctx.createGain();
    wet.gain.value = 0.18;
    master.connect(delay);
    delay.connect(tone);
    tone.connect(feedback);
    feedback.connect(delay);
    tone.connect(wet);
    wet.connect(ctx.destination);
    document.addEventListener('visibilitychange', () => {
      // 切到别的 app 或打开 AR 时暂停，回来接着放
      if (document.hidden) ctx.suspend();
      else if (on) ctx.resume();
    });
    return true;
  }

  function partial(dest, t, f, vel, decay) {
    const osc = ctx.createOscillator();
    osc.frequency.value = f;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vel, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
    osc.connect(g);
    g.connect(dest);
    osc.start(t);
    osc.stop(t + decay + 0.05);
  }

  function tine(dest, t, midi, vel) {
    const f = freq(midi);
    const ring = Math.min(2.4, Math.max(0.9, 2.2 - (midi - 60) * 0.04)); // 高音消失得快
    partial(dest, t, f, vel, ring);
    partial(dest, t, f * 4, vel * 0.15, 0.35);
    partial(dest, t, f * 5.4, vel * 0.08, 0.07);
  }

  function schedule(start) {
    const g = ctx.createGain();
    g.connect(master);
    let t = start;
    for (const [i, [midi, beats]] of MELODY.entries()) {
      tine(g, t, midi, 0.5);
      t += beats * BEAT * (i === MELODY.length - 1 ? 1.25 : 1);
    }
    CHORDS.forEach(([root, upper], bar) => {
      const t0 = start + (PICKUP + bar * 3) * BEAT;
      tine(g, t0, root, 0.3);
      for (const k of [1, 2]) for (const m of upper) tine(g, t0 + k * BEAT, m, 0.16);
    });
    return g;
  }

  // 每半秒看一次：快到下一遍的开始时间就排好下一遍。用音频时钟算，暂停时不会多排
  function tick() {
    if (ctx.currentTime > nextStart - 1) {
      passes = [...passes.slice(-1), schedule(nextStart)];
      nextStart += LENGTH + GAP;
    }
  }

  function start() {
    if (!ctx && !setup()) return false;
    // iOS 16.4 以后：她自己点了才响，所以静音键开着也照样放（和看视频一样）
    try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch {}
    ctx.resume();
    on = true;
    // 她可能半夜打开：每次开始都从两成音量慢慢升上来，约 4 秒到正常音量，不会一下子很大声
    const t = ctx.currentTime;
    master.gain.cancelScheduledValues(t);
    master.gain.setValueAtTime(VOLUME * 0.2, t);
    master.gain.setTargetAtTime(VOLUME, t, 1.5);
    nextStart = t + 0.15;
    tick();
    timer = setInterval(tick, 500);
    return true;
  }

  function stop() {
    on = false;
    clearInterval(timer);
    for (const g of passes) {
      g.gain.setTargetAtTime(0, ctx.currentTime, 0.05);
      setTimeout(() => g.disconnect(), 400);
    }
    passes = [];
    try { if (navigator.audioSession) navigator.audioSession.type = 'auto'; } catch {}
  }

  return {
    toggle() {
      if (on) stop();
      else start();
      return on;
    },
    get on() { return on; },
    supported: !!(window.AudioContext || window.webkitAudioContext),
  };
}
