// --- DOM要素 ---
const startScreen = document.getElementById('startScreen');
const startButton = document.getElementById('startButton');
const spmDisplay = document.getElementById('spmDisplay');
const bpmDisplay = document.getElementById('bpmDisplay');
const hrDisplay = document.getElementById('hrDisplay');
const timbreDisplay = document.getElementById('timbreDisplay');
const spmSlider = document.getElementById('spmSlider');
const hrSlider = document.getElementById('hrSlider');

// --- 音楽エンジン (Tone.js) ---
const filter = new Tone.AutoFilter('4n').toDestination().start();
filter.depth.value = 0.8;

const synth = new Tone.PolySynth(Tone.Synth, {
  oscillator: { type: 'triangle' },
  envelope: { attack: 0.02, decay: 0.1, sustain: 0.3, release: 1 }
}).connect(filter);
synth.volume.value = -8;

const pattern = new Tone.Pattern((time, note) => {
  synth.triggerAttackRelease(note, '8n', time);
}, ['C3', 'E3', 'G3', 'B3', 'C4', 'B3', 'G3', 'E3'], 'up');
pattern.interval = '8n';

// --- アプリ状態 ---
let currentSpm = 80;
let currentHr = 70;

// --- メイン更新関数 ---
function updateMusicAndUI() {
  // UI更新
  spmDisplay.textContent = currentSpm;
  hrDisplay.textContent = currentHr;
  bpmDisplay.textContent = currentSpm;

  // テンポ更新
  Tone.Transport.bpm.rampTo(currentSpm, 0.5);

  // 心拍数に応じた音色変化
  const hrNormalized = (currentHr - 60) / 100;

  if (currentHr < 90) {
    synth.voices.forEach(v => v.oscillator.type = 'sine');
    timbreDisplay.textContent = '穏やか';
  } else if (currentHr < 130) {
    synth.voices.forEach(v => v.oscillator.type = 'triangle');
    timbreDisplay.textContent = 'クリア';
  } else {
    synth.voices.forEach(v => v.oscillator.type = 'sawtooth');
    timbreDisplay.textContent = '鋭い';
  }

  // フィルター周波数 (200Hz〜5000Hz)
  const filterFreq = 200 + hrNormalized * 4800;
  filter.filter.frequency.value = filterFreq;
}

// --- イベントリスナー ---
spmSlider.addEventListener('input', (e) => {
  currentSpm = parseInt(e.target.value);
  updateMusicAndUI();
});

hrSlider.addEventListener('input', (e) => {
  currentHr = parseInt(e.target.value);
  updateMusicAndUI();
});

startButton.addEventListener('click', () => {
  Tone.start();
  pattern.start(0);
  Tone.Transport.start();

  console.log('音楽体験を開始します');
  startScreen.style.display = 'none';
  updateMusicAndUI();
});

// 初期状態をUIに反映
window.addEventListener('DOMContentLoaded', () => {
  updateMusicAndUI();
});
