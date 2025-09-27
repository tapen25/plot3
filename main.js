// --- DOM Elements ---
const startScreen = document.getElementById('startScreen');
const startButton = document.getElementById('startButton');
const spmDisplay = document.getElementById('spmDisplay');
const bpmDisplay = document.getElementById('bpmDisplay');
const hrDisplay = document.getElementById('hrDisplay');
const timbreDisplay = document.getElementById('timbreDisplay');
const accelStatusDot = document.getElementById('accelStatusDot');
const btStatusDot = document.getElementById('btStatusDot');
const logArea = document.getElementById('logArea');

// --- State Management ---
let currentSpm = 80;
let currentHr = 70;
let logHistory = [];

// --- Logger (Improved for Debugging) ---
function log(message) {
    console.log(message);
    const timestamp = new Date().toLocaleTimeString();
    // ログ履歴の先頭に新しいメッセージを追加
    logHistory.unshift(`[${timestamp}] ${message}`); 
    if (logHistory.length > 10) {
        logHistory.pop(); // ログは最新10件まで保持
    }
    // 画面にログ履歴を表示
    logArea.innerHTML = logHistory.join('<br>');
}

// --- Music Engine (Tone.js) ---
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

// --- Main Update Function ---
function updateMusicAndUI() {
    spmDisplay.textContent = currentSpm.toFixed(0);
    hrDisplay.textContent = currentHr.toFixed(0);
    bpmDisplay.textContent = currentSpm.toFixed(0);
    Tone.Transport.bpm.rampTo(currentSpm, 1.0);

    const hrNormalized = Math.max(0, Math.min(1, (currentHr - 60) / 100));
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
    const filterFreq = 200 + hrNormalized * 4800;
    filter.baseFrequency = filterFreq;
}

// --- Accelerometer (SPM Detection) ---
const stepTimestamps = [];
const ACCEL_THRESHOLD = 11; 
let lastAccelMagnitude = 0;

function handleMotionEvent(event) {
    const { x, y, z } = event.accelerationIncludingGravity;
    if (x === null) return;
    const magnitude = Math.sqrt(x*x + y*y + z*z);
    
    if (magnitude > ACCEL_THRESHOLD && lastAccelMagnitude <= ACCEL_THRESHOLD) {
        const now = Date.now();
        stepTimestamps.push(now);
        if (stepTimestamps.length > 10) stepTimestamps.shift(); 
        if (stepTimestamps.length > 2) {
            const duration = now - stepTimestamps[0];
            const avgInterval = duration / (stepTimestamps.length - 1);
            if (avgInterval > 0) {
                 const spm = 60000 / avgInterval;
                 currentSpm = currentSpm * 0.7 + spm * 0.3;
            }
        }
    }
    lastAccelMagnitude = magnitude;
}

async function initAccelerometer() {
    log('加速度センサーの許可をリクエスト...');
    if (typeof DeviceMotionEvent.requestPermission === 'function') { // iOS 13+
        try {
            const permissionState = await DeviceMotionEvent.requestPermission();
            log(`モーションセンサー許可状態: ${permissionState}`);
            if (permissionState === 'granted') {
                window.addEventListener('devicemotion', handleMotionEvent);
                accelStatusDot.classList.replace('bg-gray-500', 'bg-green-500');
                log('加速度センサー接続完了');
            } else {
                log('加速度センサーの許可がありません');
                accelStatusDot.classList.replace('bg-gray-500', 'bg-red-500');
            }
        } catch (error) {
            log(`加速度センサーエラー: ${error.message}`);
            accelStatusDot.classList.replace('bg-gray-500', 'bg-red-500');
        }
    } else { // Androidなど
        window.addEventListener('devicemotion', handleMotionEvent);
        accelStatusDot.classList.replace('bg-gray-500', 'bg-green-500');
        log('加速度センサーに自動接続しました');
    }
}

// --- Web Bluetooth (Heart Rate) ---
function parseHeartRate(value) {
    const flags = value.getUint8(0);
    const rate16Bits = flags & 0x1;
    return rate16Bits ? value.getUint16(1, true) : value.getUint8(1);
}

async function initBluetooth() {
    log('Bluetoothデバイスを検索します...');
    if (!navigator.bluetooth) {
        log('エラー: このブラウザはWeb Bluetooth非対応です');
        btStatusDot.classList.replace('bg-gray-500', 'bg-red-500');
        return;
    }
    try {
        log('デバイス選択ポップアップを表示します...');
        const device = await navigator.bluetooth.requestDevice({
            filters: [{ services: ['heart_rate'] }],
            acceptAllDevices: false
        });

        log(`デバイス[${device.name}]を発見。接続中...`);
        btStatusDot.classList.replace('bg-gray-500', 'bg-yellow-500'); // 接続中は黄色
        
        const server = await device.gatt.connect();
        log('GATTサーバーに接続完了');
        
        const service = await server.getPrimaryService('heart_rate');
        log('心拍数サービスを取得');
        
        const characteristic = await service.getCharacteristic('heart_rate_measurement');
        log('心拍数特性(Characteristic)を取得');
        
        await characteristic.startNotifications();
        log('心拍数の通知待機中...');
        
        characteristic.addEventListener('characteristicvaluechanged', (event) => {
            currentHr = parseHeartRate(event.target.value);
            
            // 最初のデータ受信時に緑色にする
            if(btStatusDot.classList.contains('bg-yellow-500')){
                 btStatusDot.classList.replace('bg-yellow-500', 'bg-green-500');
                 log(`心拍数[${currentHr}]の受信を開始しました！`);
            }
            
            // データ受信を視覚的にフィードバック
            hrDisplay.classList.add('transition-all', 'duration-100', 'text-white');
            setTimeout(()=> hrDisplay.classList.remove('text-white'), 200);
        });
        
    } catch(error) {
        log(`Bluetoothエラー: ${error.message}`);
        btStatusDot.classList.replace('bg-yellow-500', 'bg-red-500');
        btStatusDot.classList.replace('bg-gray-500', 'bg-red-500');
    }
}

// --- Main Initialization ---
startButton.addEventListener('click', async () => {
    log('初期化を開始します');
    await Tone.start();
    log('オーディオコンテキストを開始しました');
    Tone.Transport.start();
    pattern.start(0);
    
    startScreen.style.opacity = '0';
    setTimeout(() => startScreen.style.display = 'none', 500);

    await initAccelerometer();
    await initBluetooth();

    setInterval(updateMusicAndUI, 500);
});

