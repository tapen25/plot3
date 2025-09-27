// --- DOM Elements --
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

// --- Logger ---
function log(message) {
    console.log(message);
    logArea.textContent = `ログ: ${message}`;
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
    Tone.Transport.bpm.rampTo(currentSpm, 0.5);

    const hrNormalized = (currentHr - 60) / 100;
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
const ACCEL_THRESHOLD = 11; // 歩行検出の閾値 (要調整)
let lastAccelMagnitude = 0;

function handleMotionEvent(event) {
    const { x, y, z } = event.accelerationIncludingGravity;
    if(x === null || y === null || z === null) return;
    const magnitude = Math.sqrt(x*x + y*y + z*z);
    
    // 閾値を超えた瞬間をステップとして検出
    if (magnitude > ACCEL_THRESHOLD && lastAccelMagnitude <= ACCEL_THRESHOLD) {
        const now = Date.now();
        stepTimestamps.push(now);
        if (stepTimestamps.length > 5) {
            stepTimestamps.shift(); // 古いデータを削除
        }

        if (stepTimestamps.length > 1) {
            const duration = now - stepTimestamps[0];
            const avgInterval = duration / (stepTimestamps.length - 1);
            const spm = 60000 / avgInterval;
            // SPMを滑らかに更新
            currentSpm = currentSpm * 0.7 + spm * 0.3;
        }
    }
    lastAccelMagnitude = magnitude;
}

async function initAccelerometer() {
    log('加速度センサーの許可をリクエストします...');
    if (typeof DeviceMotionEvent.requestPermission === 'function') {
        try {
            const permissionState = await DeviceMotionEvent.requestPermission();
            if (permissionState === 'granted') {
                window.addEventListener('devicemotion', handleMotionEvent);
                accelStatusDot.classList.replace('bg-gray-500', 'bg-green-500');
                log('加速度センサーに接続しました。');
            } else {
                log('加速度センサーの許可がありません。');
                accelStatusDot.classList.replace('bg-gray-500', 'bg-red-500');
            }
        } catch (error) {
            log('加速度センサーのリクエストエラー: ' + error.message);
            accelStatusDot.classList.replace('bg-gray-500', 'bg-red-500');
        }
    } else {
        // For devices that don't need explicit permission (e.g., Android Chrome)
        window.addEventListener('devicemotion', handleMotionEvent);
        accelStatusDot.classList.replace('bg-gray-500', 'bg-green-500');
        log('加速度センサーに接続しました。');
    }
}

// --- Web Bluetooth (Heart Rate) ---
function parseHeartRate(value) {
    const flags = value.getUint8(0);
    const rate16Bits = flags & 0x1;
    let heartRate;
    if (rate16Bits) {
        heartRate = value.getUint16(1, true);
    } else {
        heartRate = value.getUint8(1);
    }
    return heartRate;
}

async function initBluetooth() {
    log('Bluetoothデバイスを探しています...');
    if (!navigator.bluetooth) {
        log('Web Bluetoothがこのブラウザではサポートされていません。');
        btStatusDot.classList.replace('bg-gray-500', 'bg-red-500');
        return;
    }
    try {
        const device = await navigator.bluetooth.requestDevice({
            filters: [{ services: ['heart_rate'] }],
            acceptAllDevices: false
        });
        log(`デバイス「${device.name}」に接続中...`);
        const server = await device.gatt.connect();
        log('GATTサーバーに接続しました。');
        const service = await server.getPrimaryService('heart_rate');
        log('心拍数サービスを取得しました。');
        const characteristic = await service.getCharacteristic('heart_rate_measurement');
        log('心拍数特性を取得しました。通知を開始します。');
        await characteristic.startNotifications();
        characteristic.addEventListener('characteristicvaluechanged', (event) => {
            const hr = parseHeartRate(event.target.value);
            currentHr = hr;
        });
        btStatusDot.classList.replace('bg-gray-500', 'bg-green-500');
        log(`デバイス「${device.name}」に接続完了`);
    } catch(error) {
        log('Bluetooth接続エラー: ' + error.message);
        btStatusDot.classList.replace('bg-gray-500', 'bg-red-500');
    }
}

// --- Main Initialization ---
startButton.addEventListener('click', async () => {
    log('初期化を開始します...');
    // Start audio context
    await Tone.start();
    Tone.Transport.start();
    pattern.start(0);

    // Hide start screen
    startScreen.style.opacity = '0';
    setTimeout(() => startScreen.style.display = 'none', 500);

    // Connect sensors
    await initAccelerometer();
    await initBluetooth();

    // Start the update loop
    setInterval(updateMusicAndUI, 200);
    log('システムの準備が完了しました。');
});
