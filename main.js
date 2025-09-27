// main.js

// --- DOM要素の取得 ---
const controlButton = document.getElementById('controlButton');
const statusText = document.getElementById('statusText');
const bpmText = document.getElementById('bpmText');
const hrText = document.getElementById('hrText');

// --- グローバル変数 ---
let audioContext;
let oscillator;
let gainNode;
let filterNode;
let isRunning = false;
let bpm = 120; // 初期BPM
let lastStepTime = 0;
const stepTimestamps = [];

let heartRate = 70; // 初期心拍数

// --- メインの制御ロジック ---
controlButton.addEventListener('click', async () => {
    if (!isRunning) {
        await initialize();
    } else {
        stop();
    }
});

// --- 初期化処理 ---
async function initialize() {
    try {
        statusText.textContent = 'INITIALIZING...';

        // 1. オーディオコンテキストの作成と設定
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        setupAudioNodes();

        // 2. センサーへのアクセス許可をリクエスト (特にiOSで重要)
        await requestSensorPermissions();

        // 3. 加速度センサーの監視を開始
        window.addEventListener('devicemotion', handleMotionEvent);

        // 4. スマートウォッチ（心拍計）への接続を試みる
        await connectBluetoothDevice();
        
        // 5. 音楽再生を開始
        startMusic();

        isRunning = true;
        controlButton.textContent = 'STOP';
        statusText.textContent = 'RUNNING';
    } catch (error) {
        statusText.textContent = `ERROR: ${error.message}`;
        console.error(error);
        stop(); // エラー発生時は状態をリセット
    }
}

// --- 停止処理 ---
function stop() {
    if (audioContext) {
        audioContext.close();
        audioContext = null;
    }
    window.removeEventListener('devicemotion', handleMotionEvent);
    // Bluetooth接続解除の処理は複雑なため、ここでは省略（リロードで解除）
    
    isRunning = false;
    controlButton.textContent = 'START';
    statusText.textContent = 'IDLE';
    bpmText.textContent = '--';
    hrText.textContent = '--';
}


// --- センサーのアクセス許可 ---
async function requestSensorPermissions() {
    // iOS 13以降のSafariでは、ユーザーの操作をきっかけに許可を求める必要がある
    if (typeof DeviceMotionEvent.requestPermission === 'function') {
        const permission = await DeviceMotionEvent.requestPermission();
        if (permission !== 'granted') {
            throw new Error('Acceleration sensor permission not granted.');
        }
    }
}


// --- Web Audio APIのセットアップ ---
function setupAudioNodes() {
    // GainNode: 音量を制御
    gainNode = audioContext.createGain();
    gainNode.gain.setValueAtTime(0, audioContext.currentTime); // 最初は音量0
    
    // BiquadFilterNode: 音色を変化させる（ローパスフィルター）
    filterNode = audioContext.createBiquadFilter();
    filterNode.type = 'lowpass';
    filterNode.frequency.value = 500; // 初期値（こもった音）
    
    // OscillatorNode: 音源（サイン波）
    oscillator = audioContext.createOscillator();
    oscillator.type = 'sawtooth'; // ノコギリ波
    oscillator.frequency.value = 110; // A2の音
    
    // ノードを接続: Oscillator -> Filter -> Gain -> 出力
    oscillator.connect(filterNode);
    filterNode.connect(gainNode);
    gainNode.connect(audioContext.destination);
    
    oscillator.start();
}


// --- 加速度センサーの処理 ---
function handleMotionEvent(event) {
    if (!isRunning) return;

    const acceleration = event.accelerationIncludingGravity;
    // 加速度の大きさ（ベクトル長）を計算
    const magnitude = Math.sqrt(acceleration.x ** 2 + acceleration.y ** 2 + acceleration.z ** 2);

    // 歩行検知（単純な閾値判定）
    if (magnitude > 15) { // この閾値はデバイスや歩き方によって調整が必要
        const now = Date.now();
        if (now - lastStepTime > 300) { // 300ms以内の連続したピークは無視 (チャタリング防止)
            lastStepTime = now;
            stepTimestamps.push(now);
            
            // 古いタイムスタンプを削除 (直近5秒間のデータで計算)
            while (stepTimestamps.length > 0 && now - stepTimestamps[0] > 5000) {
                stepTimestamps.shift();
            }

            calculateBPM();
        }
    }
}

// --- BPMの計算 ---
function calculateBPM() {
    if (stepTimestamps.length < 2) return;
    
    const duration = (stepTimestamps[stepTimestamps.length - 1] - stepTimestamps[0]) / 1000; // 秒単位
    const steps = stepTimestamps.length - 1;
    const currentBPM = Math.round((steps / duration) * 60);

    if (currentBPM > 40 && currentBPM < 220) { // ありえない値は無視
        bpm = currentBPM;
        bpmText.textContent = bpm;
    }
}


// --- Bluetoothデバイス（心拍計）への接続 ---
async function connectBluetoothDevice() {
    if (!navigator.bluetooth) {
        throw new Error('Web Bluetooth API is not supported in this browser.');
    }
    try {
        statusText.textContent = 'SCANNING FOR HR MONITOR...';
        const device = await navigator.bluetooth.requestDevice({
            filters: [{ services: ['heart_rate'] }],
            acceptAllDevices: false,
        });

        statusText.textContent = 'CONNECTING...';
        const server = await device.gatt.connect();
        const service = await server.getPrimaryService('heart_rate');
        const characteristic = await service.getCharacteristic('heart_rate_measurement');

        await characteristic.startNotifications();
        characteristic.addEventListener('characteristicvaluechanged', handleHeartRateChanged);
        statusText.textContent = 'RUNNING';
    } catch(error) {
        console.warn('Could not connect to heart rate monitor.', error);
        statusText.textContent = 'HR MONITOR NOT FOUND. RUNNING WITHOUT IT.';
        // 心拍計が見つからなくても、加速度センサーだけで動作を継続
    }
}

// --- 心拍数データの処理 ---
function handleHeartRateChanged(event) {
    const value = event.target.value;
    // データ形式のドキュメントに基づきパース
    const flags = value.getUint8(0);
    const rate16Bits = flags & 0x1;
    let hr;
    if (rate16Bits) {
        hr = value.getUint16(1, true); // 16ビット little-endian
    } else {
        hr = value.getUint8(1); // 8ビット
    }
    
    heartRate = hr;
    hrText.textContent = heartRate;

    // 心拍数に応じて音色を変化させる
    updateSoundEffect();
}

// --- 音楽再生のスケジューラ ---
function startMusic() {
    let nextBeatTime = audioContext.currentTime;

    function scheduler() {
        if (!isRunning) return;

        while (nextBeatTime < audioContext.currentTime + 0.1) {
            // ビートを鳴らす
            gainNode.gain.setValueAtTime(0.5, nextBeatTime);
            gainNode.gain.exponentialRampToValueAtTime(0.001, nextBeatTime + 0.2);

            // 次のビートの時間を計算
            const secondsPerBeat = 60.0 / bpm;
            nextBeatTime += secondsPerBeat;
        }
        requestAnimationFrame(scheduler);
    }
    scheduler();
}

// --- 心拍数に応じた音色変化 ---
function updateSoundEffect() {
    // 心拍数が60-160の範囲で、フィルター周波数を500Hz-4000Hzにマッピング
    const minHR = 60, maxHR = 160;
    const minFreq = 500, maxFreq = 4000;
    
    let normalizedHR = (heartRate - minHR) / (maxHR - minHR);
    normalizedHR = Math.max(0, Math.min(1, normalizedHR)); // 0.0 ~ 1.0 の範囲に収める
    
    const newFreq = minFreq + (normalizedHR * (maxFreq - minFreq));
    
    if (audioContext) {
        // 現在の周波数から新しい周波数へスムーズに変化させる
        filterNode.frequency.setTargetAtTime(newFreq, audioContext.currentTime, 0.1);
    }
}
