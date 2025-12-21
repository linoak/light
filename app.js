document.addEventListener('DOMContentLoaded', () => {
    // Top Level State
    let locationWatchId = null;
    let videoTrack = null;
    let isTorchOn = false;
    let isSosOn = false;
    let sosTimer = null;
    let isSirenOn = false;
    let audioContext = null;
    let sirenOscillator = null;
    let sirenGain = null;

    // Elements
    const elCoords = document.getElementById('coords-display');
    const btnLocation = document.getElementById('btn-location');
    const btnTorch = document.getElementById('btn-torch');
    const btnSos = document.getElementById('btn-sos');
    const btnSiren = document.getElementById('btn-siren');
    const elError = document.getElementById('error-message');
    const elErrorText = document.getElementById('error-text');
    const btnErrorClose = elError.querySelector('.delete');

    // UI Helpers
    const showError = (msg) => {
        elErrorText.textContent = msg;
        elError.classList.remove('is-hidden');
    };
    const hideError = () => {
        elError.classList.add('is-hidden');
    };
    btnErrorClose.addEventListener('click', hideError);

    // --- 1. Geolocation ---
    btnLocation.addEventListener('click', () => {
        hideError();
        if (!navigator.geolocation) {
            showError("您的裝置不支援地理位置功能。");
            return;
        }

        btnLocation.classList.add('is-loading');

        navigator.geolocation.getCurrentPosition(
            (position) => {
                btnLocation.classList.remove('is-loading');
                const { latitude, longitude, accuracy } = position.coords;
                elCoords.textContent =
                    `緯度: ${latitude.toFixed(5)}\n經度: ${longitude.toFixed(5)}\n(準確度: ${accuracy.toFixed(1)}m)`;
            },
            (err) => {
                btnLocation.classList.remove('is-loading');
                switch (err.code) {
                    case err.PERMISSION_DENIED:
                        showError("無法取得位置：權限被拒絕。");
                        break;
                    case err.POSITION_UNAVAILABLE:
                        showError("無法取得位置：位置資訊無法使用。");
                        break;
                    case err.TIMEOUT:
                        showError("無法取得位置：請求逾時。");
                        break;
                    default:
                        showError("無法取得位置：未知錯誤。");
                }
            },
            { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
        );
    });

    // --- 2. Flashlight & SOS Helper ---
    // Initialize Camera Logic
    async function initCamera() {
        if (videoTrack) return videoTrack;

        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: 'environment' }
            });
            videoTrack = stream.getVideoTracks()[0];

            // Check if torch is supported
            const capabilities = videoTrack.getCapabilities();
            if (!capabilities.torch) {
                showError("您的裝置（相機）不支援手電筒功能。");
                stopCamera();
                return null;
            }
            return videoTrack;
        } catch (err) {
            console.error(err);
            if (err.name === 'NotAllowedError') {
                showError("無法存取相機：權限被拒絕。手電筒需要相機權限。");
            } else {
                showError(`無法存取相機：${err.message}`);
            }
            return null;
        }
    }

    function stopCamera() {
        if (videoTrack) {
            videoTrack.stop();
            videoTrack = null;
        }
    }

    async function setTorch(state) {
        const track = await initCamera();
        if (!track) return;
        try {
            await track.applyConstraints({
                advanced: [{ torch: state }]
            });
        } catch (err) {
            console.error('Torch failure', err);
            // Some devices might throw if torch is not ready or supported in this context
        }
    }

    // --- 3. Flashlight Logic ---
    btnTorch.addEventListener('click', async () => {
        hideError();
        // If SOS is on, turn it off first
        if (isSosOn) {
            stopSos();
        }

        if (isTorchOn) {
            // Turn Off
            await setTorch(false);
            isTorchOn = false;
            btnTorch.classList.remove('is-warning');
            btnTorch.classList.add('is-white');
            stopCamera(); // Release camera when not needed
        } else {
            // Turn On
            await setTorch(true);
            // Verify if it actually turned on logic could be here, but we assume success if no error
            if (videoTrack) {
                isTorchOn = true;
                btnTorch.classList.remove('is-white');
                btnTorch.classList.add('is-warning');
            }
        }
    });

    // --- 4. SOS Logic ---
    const SOS_PATTERN = [
        200, 200, 200, // S (short on, short gap...) - wait, pattern is duration ON.
        // SOS: ... --- ...
        // We will implement a custom async looper or interval.
        // Simple approach: 
        // S: dot(200ms), gap(200), dot(200), gap(200), dot(200), gap(600)
        // O: dash(600), gap(200), dash(600), gap(200), dash(600), gap(600)
        // S: dot(200), gap(200), dot(200), gap(200), dot(200)
        // gap(1400) between words
    ];

    // Easier impl: Just a simpler flasher? User asked for "SOS light signal".
    // Let's do standard SOS morse code.
    // . . . _ _ _ . . .

    // The loop runner
    let sosStep = 0;
    async function runSosStep() {
        if (!isSosOn) return;

        // This is a simplified reliable pattern loop
        // 0: Short ON, 1: Short OFF, 2: Short ON, 3: Short OFF, 4: Short ON, 5: Long OFF (end of S)
        // 6: Long ON, 7: Short OFF, 8: Long ON, 9: Short OFF, 10: Long ON, 11: Long OFF (end of O)
        // 12: Short ON, 13: Short OFF, 14: Short ON, 15: Short OFF, 16: Short ON, 17: Pause (end of word)

        const DOT = 200;
        const DASH = 600;
        const GAP = 200; // Inter-element gap
        const LETTER_GAP = 600;
        const WORD_GAP = 1400;

        let duration = 0;
        let light = false;

        // Helper to determine state based on step index (0-17)
        // S
        if (sosStep === 0 || sosStep === 2 || sosStep === 4) { light = true; duration = DOT; }
        else if (sosStep === 1 || sosStep === 3) { light = false; duration = GAP; }
        else if (sosStep === 5) { light = false; duration = LETTER_GAP; }
        // O
        else if (sosStep === 6 || sosStep === 8 || sosStep === 10) { light = true; duration = DASH; }
        else if (sosStep === 7 || sosStep === 9) { light = false; duration = GAP; }
        else if (sosStep === 11) { light = false; duration = LETTER_GAP; }
        // S
        else if (sosStep === 12 || sosStep === 14 || sosStep === 16) { light = true; duration = DOT; }
        else if (sosStep === 13 || sosStep === 15) { light = false; duration = GAP; }
        else if (sosStep === 17) { light = false; duration = WORD_GAP; }

        if (light) {
            await setTorch(true);
        } else {
            await setTorch(false);
        }

        sosStep++;
        if (sosStep > 17) sosStep = 0;

        sosTimer = setTimeout(runSosStep, duration);
    }

    function stopSos() {
        clearTimeout(sosTimer);
        isSosOn = false;
        setTorch(false);
        stopCamera();
        btnSos.classList.remove('is-active-sos');
        btnSos.classList.remove('is-danger');
        btnSos.classList.add('is-white');
    }

    btnSos.addEventListener('click', async () => {
        hideError();
        // If Torch is on, turn it off essentially (override)
        if (isTorchOn) {
            isTorchOn = false;
            btnTorch.classList.remove('is-warning');
            btnTorch.classList.add('is-white');
            // setTorch(false) will happen in loop or immediately, but let's reset
            await setTorch(false);
        }

        if (isSosOn) {
            stopSos();
        } else {
            // Start SOS
            // Ensure camera access first
            const track = await initCamera();
            if (track) {
                isSosOn = true;
                sosStep = 0;
                btnSos.classList.remove('is-white');
                btnSos.classList.add('is-danger');
                btnSos.classList.add('is-active-sos');
                runSosStep();
            }
        }
    });

    // --- 5. Siren Logic ---
    let sirenAudio = new Audio('alarm.mp3');
    sirenAudio.loop = true;

    function startSiren() {
        // Must interact with document first, which is covered by the click handler
        sirenAudio.currentTime = 0;
        sirenAudio.play().catch(e => {
            console.error(e);
            showError("無法播放音效：" + e.message);
            stopSiren();
        });
    }

    function stopSiren() {
        sirenAudio.pause();
        sirenAudio.currentTime = 0;

        isSirenOn = false;
        btnSiren.classList.remove('is-active-siren');
        btnSiren.classList.remove('is-danger');
        btnSiren.classList.add('is-white');
    }

    btnSiren.addEventListener('click', () => {
        hideError();
        if (isSirenOn) {
            stopSiren();
        } else {
            isSirenOn = true;
            btnSiren.classList.remove('is-white');
            btnSiren.classList.add('is-danger');
            btnSiren.classList.add('is-active-siren');
            startSiren();
        }
    });
});
