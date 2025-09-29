
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
        // フィルター: 音の「鋭さ」をコントロール
const filter = new Tone.AutoFilter('4n').toDestination().start();
filter.depth.value = 0.8;
        // シンセサイザー: 音の「元」となる部分
        const synth = new Tone.PolySynth(Tone.Synth, {
            oscillator: { type: 'triangle' }, // 三角波からスタート
            envelope: { attack: 0.02, decay: 0.1, sustain: 0.3, release: 1 }
        }).connect(filter);
        synth.volume.value = -8;

        // 簡単なアルペジオ（分散和音）パターンを定義
        const pattern = new Tone.Pattern((time, note) => {
            synth.triggerAttackRelease(note, '8n', time);
        }, ['C3', 'E3', 'G3', 'B3', 'C4', 'B3', 'G3', 'E3'], 'up');
        pattern.interval = '8n';

        // --- アプリケーションの状態 ---
        let currentSpm = 80;
        let currentHr = 70;

        // --- メイン更新関数 ---
        function updateMusicAndUI() {
            // 1. UIを更新
            spmDisplay.textContent = currentSpm;
            hrDisplay.textContent = currentHr;
            bpmDisplay.textContent = currentSpm; // SPMをBPMに直接反映

            // 2. 音楽のテンポを更新 (滑らかに変化させる)
            Tone.Transport.bpm.rampTo(currentSpm, 0.5);

            // 3. 心拍数に応じて音色を更新
            // 心拍数が低い(60) -> 穏やか, 心拍数が高い(160) -> 鋭い
            const hrNormalized = (currentHr - 60) / 100; // 0.0 ~ 1.0 の範囲に正規化

            // a. 波形を変化させる
            if (currentHr < 90) {
                synth.set({ oscillator: { type: 'sine' } });
                timbreDisplay.textContent = '穏やか';
            } else if (currentHr < 130) {
                synth.set({ oscillator: { type: 'triangle' } });
                timbreDisplay.textContent = 'クリア';
            } else {
                synth.set({ oscillator: { type: 'sawtooth' } });
                timbreDisplay.textContent = '鋭い';
            }
            
            // b. フィルターの周波数を変化させる (高いほど明るく鋭い音に)
            // 200Hz (こもった音) から 5000Hz (開いた音) の範囲で変化
            const filterFreq = 200 + hrNormalized * 4800;
            filter.baseFrequency = filterFreq;
        }

        // --- イベントリスナー ---
        spmSlider.addEventListener('input', (event) => {
            currentSpm = parseInt(event.target.value);
            updateMusicAndUI();
        });

        hrSlider.addEventListener('input', (event) => {
            currentHr = parseInt(event.target.value);
            updateMusicAndUI();
        });

        startButton.addEventListener('click', () => {
            // ユーザー操作をきっかけにオーディオを開始
            Tone.start();
            Tone.Transport.start();
            pattern.start(0);
            
            console.log('音楽体験を開始します');
            startScreen.style.display = 'none';
            // 初期値を反映
            updateMusicAndUI();
        });
