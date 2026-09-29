/**
 * Touch & Hold Flashlight Web Application
 * High-performance mobile-first torch controller with zero repeated permission prompts,
 * rock-solid pointer event handling, audio/haptic feedback, and graceful fallback.
 */

(() => {
  'use strict';

  // --- State Variables ---
  let mediaStream = null;
  let videoTrack = null;
  let torchSupported = false;
  let isTorchReady = false;
  let isPressed = false;
  let currentTorchState = false; // actual hardware state
  let desiredTorchState = false; // desired state based on user touch
  let isApplyingConstraints = false;

  let currentMode = 'hardware'; // 'hardware' | 'screen'
  let hapticsEnabled = true;
  let soundEnabled = true;
  let strobeEnabled = false;
  let strobeIntervalId = null;

  let wakeLock = null;
  let deferredInstallPrompt = null;
  let audioCtx = null;

  // --- DOM Elements ---
  const torchBtn = document.getElementById('torchBtn');
  const enableTorchBtn = document.getElementById('enableTorchBtn');
  const setupCard = document.getElementById('setupCard');
  const statusPill = document.getElementById('statusPill');
  const statusText = document.getElementById('statusText');
  const buttonTitle = document.getElementById('buttonTitle');
  const buttonSubtitle = document.getElementById('buttonSubtitle');
  const lightBeam = document.getElementById('lightBeam');
  const ambientGlow = document.getElementById('ambientGlow');
  const screenTorchOverlay = document.getElementById('screenTorchOverlay');
  const footerHint = document.getElementById('footerHint');

  // Toolbar Buttons
  const modeToggleBtn = document.getElementById('modeToggleBtn');
  const modeIcon = document.getElementById('modeIcon');
  const modeLabel = document.getElementById('modeLabel');
  const hapticToggleBtn = document.getElementById('hapticToggleBtn');
  const soundToggleBtn = document.getElementById('soundToggleBtn');
  const strobeToggleBtn = document.getElementById('strobeToggleBtn');
  const installBtn = document.getElementById('installBtn');
  const infoBtn = document.getElementById('infoBtn');

  // Modals
  const infoModal = document.getElementById('infoModal');
  const closeInfoBtn = document.getElementById('closeInfoBtn');
  const okInfoBtn = document.getElementById('okInfoBtn');
  const testScreenTorchBtn = document.getElementById('testScreenTorchBtn');

  const fallbackModal = document.getElementById('fallbackModal');
  const fallbackTitle = document.getElementById('fallbackTitle');
  const closeFallbackBtn = document.getElementById('closeFallbackBtn');
  const dismissFallbackBtn = document.getElementById('dismissFallbackBtn');
  const enableScreenModeBtn = document.getElementById('enableScreenModeBtn');
  const fallbackMessage = document.getElementById('fallbackMessage');
  const fallbackHttpsBtn = document.getElementById('fallbackHttpsBtn');
  const insecureBanner = document.getElementById('insecureBanner');
  const bannerHttpsBtn = document.getElementById('bannerHttpsBtn');

  // Diagnostics Elements
  const diagContext = document.getElementById('diagContext');
  const diagMedia = document.getElementById('diagMedia');
  const diagTorch = document.getElementById('diagTorch');
  const diagCamera = document.getElementById('diagCamera');
  const diagBrowser = document.getElementById('diagBrowser');

  // --- Synthesized Tactical Audio (Web Audio API) ---
  function initAudio() {
    if (!audioCtx) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (AudioContext) {
        audioCtx = new AudioContext();
      }
    }
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
  }

  function playClickSound(type = 'down') {
    if (!soundEnabled) return;
    try {
      initAudio();
      if (!audioCtx) return;

      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      const now = audioCtx.currentTime;

      if (type === 'down') {
        // High crisp tactile switch click
        osc.type = 'sine';
        osc.frequency.setValueAtTime(1400, now);
        osc.frequency.exponentialRampToValueAtTime(350, now + 0.035);
        gain.gain.setValueAtTime(0.3, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.035);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start(now);
        osc.stop(now + 0.035);
      } else {
        // Subtle release click
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(600, now);
        osc.frequency.exponentialRampToValueAtTime(200, now + 0.025);
        gain.gain.setValueAtTime(0.2, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.025);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start(now);
        osc.stop(now + 0.025);
      }
    } catch (e) {
      // Audio autoplay policy or failure - ignore gracefully
    }
  }

  // --- Haptic Feedback ---
  function triggerHaptics(type = 'press') {
    if (!hapticsEnabled || !navigator.vibrate) return;
    try {
      if (type === 'press') {
        navigator.vibrate(35);
      } else if (type === 'release') {
        navigator.vibrate(15);
      } else if (type === 'warning') {
        navigator.vibrate([40, 60, 40]);
      }
    } catch (e) {
      // Haptic error ignored
    }
  }

  // --- Screen Wake Lock (Keeps display awake during use) ---
  async function requestWakeLock() {
    if ('wakeLock' in navigator && !wakeLock) {
      try {
        wakeLock = await navigator.wakeLock.request('screen');
        wakeLock.addEventListener('release', () => {
          wakeLock = null;
        });
      } catch (err) {
        console.warn('Wake Lock request failed:', err);
      }
    }
  }

  function releaseWakeLock() {
    if (wakeLock) {
      wakeLock.release().catch(() => {});
      wakeLock = null;
    }
  }

  // --- UI Update Helpers ---
  function updateUIState(state) {
    statusPill.className = 'status-pill';

    switch (state) {
      case 'idle':
        statusPill.classList.add('status-idle');
        statusText.textContent = 'Setup Required';
        buttonTitle.textContent = 'SETUP FIRST';
        buttonSubtitle.textContent = 'Tap setup below';
        torchBtn.classList.add('locked');
        torchBtn.disabled = true;
        break;

      case 'ready':
        statusPill.classList.add('status-ready');
        statusText.textContent = currentMode === 'hardware' ? 'Torch Ready' : 'Screen Torch Ready';
        buttonTitle.textContent = 'HOLD TO FLASH';
        buttonSubtitle.textContent = 'Touch & hold button';
        torchBtn.classList.remove('locked');
        torchBtn.disabled = false;
        footerHint.textContent = 'Touch & hold to turn ON. Release to turn OFF immediately.';
        break;

      case 'flashing':
        statusPill.classList.add('status-flashing');
        statusText.textContent = strobeEnabled ? 'STROBE ACTIVE' : 'FLASHING ON';
        buttonTitle.textContent = 'FLASHING';
        buttonSubtitle.textContent = 'Release to turn off';
        break;

      case 'error':
        statusPill.classList.add('status-error');
        statusText.textContent = 'Torch Unavailable';
        buttonTitle.textContent = 'UNSUPPORTED';
        buttonSubtitle.textContent = 'Switch to Screen Mode';
        break;
    }
  }

  function setVisualIllumination(active) {
    if (active) {
      torchBtn.classList.add('active');
      lightBeam.classList.add('beaming');
      ambientGlow.classList.add('glowing');
      if (currentMode === 'screen') {
        screenTorchOverlay.classList.add('active');
      }
      updateUIState('flashing');
    } else {
      torchBtn.classList.remove('active');
      lightBeam.classList.remove('beaming');
      ambientGlow.classList.remove('glowing');
      screenTorchOverlay.classList.remove('active');
      if (isTorchReady) {
        updateUIState('ready');
      }
    }
  }

  // --- Hardware Torch Controller (Serialized Queue) ---
  /**
   * Serialized state coordinator to eliminate race conditions from rapid tapping.
   * Guarantees final hardware state strictly reflects desired state (ON or OFF).
   */
  async function syncTorchHardware(desired) {
    desiredTorchState = desired;

    if (isApplyingConstraints) {
      // An operation is already in flight. Once it completes, the loop will catch desiredTorchState.
      return;
    }

    isApplyingConstraints = true;

    while (currentTorchState !== desiredTorchState) {
      const stateToApply = desiredTorchState;
      try {
        if (currentMode === 'hardware' && videoTrack && torchSupported) {
          await videoTrack.applyConstraints({
            advanced: [{ torch: stateToApply }]
          });
        }
        currentTorchState = stateToApply;
      } catch (err) {
        console.warn('Torch applyConstraints failed:', err);
        // If applying true fails, fallback
        if (stateToApply === true) {
          triggerHaptics('warning');
          showFallbackDialog('The camera hardware reported an error while enabling the torch.');
        }
        currentTorchState = false;
        break;
      }
    }

    isApplyingConstraints = false;

    // Safety re-check in case user released during the last iteration
    if (currentTorchState !== desiredTorchState) {
      syncTorchHardware(desiredTorchState);
    }
  }

  // --- Torch Activation & Release Actions ---
  function activateTorch() {
    if (!isTorchReady || isPressed) return;
    isPressed = true;

    initAudio();
    playClickSound('down');
    triggerHaptics('press');
    requestWakeLock();

    setVisualIllumination(true);

    if (strobeEnabled) {
      startStrobeMode();
    } else {
      syncTorchHardware(true);
    }
  }

  function releaseTorch() {
    if (!isPressed) return;
    isPressed = false;

    playClickSound('up');
    triggerHaptics('release');
    releaseWakeLock();

    if (strobeIntervalId) {
      clearInterval(strobeIntervalId);
      strobeIntervalId = null;
    }

    setVisualIllumination(false);
    syncTorchHardware(false);
  }

  // --- Strobe / Pulse Effect ---
  function startStrobeMode() {
    let pulse = true;
    syncTorchHardware(true);
    strobeIntervalId = setInterval(() => {
      if (!isPressed) {
        clearInterval(strobeIntervalId);
        strobeIntervalId = null;
        syncTorchHardware(false);
        return;
      }
      pulse = !pulse;
      syncTorchHardware(pulse);
      if (currentMode === 'screen') {
        if (pulse) screenTorchOverlay.classList.add('active');
        else screenTorchOverlay.classList.remove('active');
      }
    }, 90); // ~11 Hz strobe
  }

  // --- Camera & Torch Initialization (Phase 2) ---
  /**
   * Requests camera permission ONCE via user gesture.
   * Stores stream and track in memory; does NOT re-request permission on each touch!
   */
  async function initCameraTorch() {
    enableTorchBtn.disabled = true;
    enableTorchBtn.innerHTML = '<span class="btn-text">Initializing...</span>';

    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('MediaDevices API is not supported on this browser or context.');
      }

      // 1. Request environment camera stream
      const constraints = {
        video: {
          facingMode: { ideal: 'environment' }
        },
        audio: false
      };

      mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
      videoTrack = mediaStream.getVideoTracks()[0];

      if (!videoTrack) {
        throw new Error('No video track returned from camera.');
      }

      // Listen for unexpected track ending (e.g. phone lock, incoming call)
      videoTrack.addEventListener('ended', () => {
        handleTrackEnded();
      });

      // 2. Feature detection: Check torch capability
      let caps = {};
      if (typeof videoTrack.getCapabilities === 'function') {
        caps = videoTrack.getCapabilities();
      }

      torchSupported = Boolean(caps && caps.torch);

      // Verify track label and settings for diagnostics
      const settings = typeof videoTrack.getSettings === 'function' ? videoTrack.getSettings() : {};
      updateDiagnosticsUI(caps, settings);

      if (torchSupported) {
        // Torch capability is available and stream is active!
        isTorchReady = true;
        setupCard.classList.add('hidden');
        updateUIState('ready');
        currentMode = 'hardware';
        updateModeUI();
      } else {
        // Hardware torch constraint not exposed (e.g. iOS Safari, laptop webcam, or unsupported device)
        handleTorchNotSupported();
      }
    } catch (err) {
      console.error('Initialization error:', err);
      handleInitError(err);
    } finally {
      enableTorchBtn.disabled = false;
      enableTorchBtn.innerHTML = `
        <span class="btn-text">Enable Flashlight</span>
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M5 12h14M12 5l7 7-7 7"/>
        </svg>
      `;
    }
  }

  // --- Fallback & Error Handlers ---
  function handleTorchNotSupported() {
    isTorchReady = true;
    torchSupported = false;
    currentMode = 'screen';
    updateModeUI();
    setupCard.classList.add('hidden');
    updateUIState('ready');

    fallbackMessage.innerHTML = `
      Your device or browser allows camera access, but <strong>does not expose direct hardware torch control</strong> to websites (common on iOS Safari or desktop webcams).<br><br>
      We have automatically activated <strong>Screen Torch Mode</strong> for you.
    `;
    fallbackModal.classList.remove('hidden');
  }

  function getHttpsUrl() {
    const hostname = window.location.hostname;
    // Port 8000 maps to HTTPS port 8443 in our dual dev server
    const httpsPort = window.location.port === '8000' ? '8443' : (window.location.port || '8443');
    return `https://${hostname}:${httpsPort}/`;
  }

  function checkSecureContext() {
    const isLocalhost = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
    const isHttp = location.protocol === 'http:';

    if (!window.isSecureContext && !isLocalhost && isHttp) {
      const httpsUrl = getHttpsUrl();
      if (insecureBanner) {
        insecureBanner.classList.remove('hidden');
      }
      if (bannerHttpsBtn) {
        bannerHttpsBtn.href = httpsUrl;
      }
      if (fallbackHttpsBtn) {
        fallbackHttpsBtn.href = httpsUrl;
      }
    }
  }

  function handleInitError(err) {
    triggerHaptics('warning');
    const isPermissionDenied = err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError';
    const isInsecureContext = !window.isSecureContext || !navigator.mediaDevices;
    const isHttp = location.protocol === 'http:';
    const isLocalhost = location.hostname === 'localhost' || location.hostname === '127.0.0.1';

    if (fallbackHttpsBtn) fallbackHttpsBtn.classList.add('hidden');

    if (isInsecureContext && isHttp && !isLocalhost) {
      // Insecure context on mobile IP address
      const httpsUrl = getHttpsUrl();
      fallbackTitle.textContent = '🔒 Secure HTTPS Required';
      fallbackMessage.innerHTML = `
        <strong>Google Chrome blocks camera and flashlight hardware on unencrypted HTTP (${location.host}).</strong><br><br>
        To access the physical LED flashlight on your phone, you must open the site via <strong>HTTPS</strong>.<br><br>
        <strong>Steps to Enable Flashlight:</strong><br>
        1. Tap <strong>'Switch to Secure HTTPS'</strong> below.<br>
        2. When Chrome warns <em>"Connection is not private"</em> (self-signed cert), tap <strong>'Advanced'</strong> &rarr; <strong>'Proceed to ${location.hostname} (unsafe)'</strong>.<br>
        3. Camera & Flashlight permission will now work natively!<br><br>
        <em>Or tap 'Switch to Screen Torch Mode' to use instant screen flashlight right now without HTTPS.</em>
      `;
      if (fallbackHttpsBtn) {
        fallbackHttpsBtn.href = httpsUrl;
        fallbackHttpsBtn.classList.remove('hidden');
      }
    } else if (isPermissionDenied) {
      fallbackTitle.textContent = 'Camera Permission Denied';
      fallbackMessage.innerHTML = `
        <strong>Camera permission was denied in your browser.</strong><br><br>
        To use the physical flashlight, tap the lock/tune icon in your address bar and allow Camera permission for this site.<br><br>
        Alternatively, you can switch to <strong>Screen Torch Mode</strong> without granting any permissions!
      `;
    } else {
      fallbackTitle.textContent = 'Hardware Torch Unavailable';
      fallbackMessage.innerHTML = `
        Could not initialize device camera: <strong>${err.message || 'Unknown error'}</strong>.<br><br>
        You can switch to <strong>Screen Torch Mode</strong> for a high-brightness screen flashlight.
      `;
    }

    fallbackModal.classList.remove('hidden');
  }

  function handleTrackEnded() {
    releaseTorch();
    isTorchReady = false;
    mediaStream = null;
    videoTrack = null;
    setupCard.classList.remove('hidden');
    updateUIState('idle');
  }

  // --- Screen Torch Mode (Universal Fallback) ---
  function setScreenTorchMode() {
    currentMode = 'screen';
    isTorchReady = true;
    setupCard.classList.add('hidden');
    updateModeUI();
    updateUIState('ready');
    fallbackModal.classList.add('hidden');
  }

  function toggleMode() {
    if (currentMode === 'hardware') {
      currentMode = 'screen';
    } else {
      if (torchSupported && videoTrack) {
        currentMode = 'hardware';
      } else {
        // Hardware torch not ready or unsupported
        initCameraTorch();
        return;
      }
    }
    updateModeUI();
    updateUIState('ready');
  }

  function updateModeUI() {
    if (currentMode === 'screen') {
      modeIcon.textContent = '📱';
      modeLabel.textContent = 'Screen';
      modeToggleBtn.classList.add('screen-mode');
      footerHint.textContent = 'Screen Torch Mode: Screen flashes pure white at max brightness on hold.';
    } else {
      modeIcon.textContent = '⚡';
      modeLabel.textContent = 'Hardware';
      modeToggleBtn.classList.remove('screen-mode');
      footerHint.textContent = 'Hardware Torch: Device rear LED illuminates only while held.';
    }
  }

  // --- Pointer Events (Touch-and-Hold Implementation) ---
  function setupPointerEvents() {
    // 1. Pointer Down
    torchBtn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      try {
        if (torchBtn.setPointerCapture) {
          torchBtn.setPointerCapture(e.pointerId);
        }
      } catch (err) {
        // Pointer capture fallback
      }
      activateTorch();
    });

    // 2. Pointer Up (Release)
    torchBtn.addEventListener('pointerup', (e) => {
      e.preventDefault();
      try {
        if (torchBtn.hasPointerCapture && torchBtn.hasPointerCapture(e.pointerId)) {
          torchBtn.releasePointerCapture(e.pointerId);
        }
      } catch (err) {}
      releaseTorch();
    });

    // 3. Pointer Cancel (System gestures, incoming calls, alerts)
    torchBtn.addEventListener('pointercancel', (e) => {
      e.preventDefault();
      releaseTorch();
    });

    // 4. Lost Pointer Capture
    torchBtn.addEventListener('lostpointercapture', () => {
      releaseTorch();
    });

    // 5. Fallback Pointer Leave (if pointer capture is not supported)
    torchBtn.addEventListener('pointerleave', () => {
      if (isPressed) {
        releaseTorch();
      }
    });

    // 6. Keyboard accessibility: Spacebar or Enter hold
    torchBtn.addEventListener('keydown', (e) => {
      if ((e.code === 'Space' || e.code === 'Enter') && !e.repeat) {
        e.preventDefault();
        activateTorch();
      }
    });

    torchBtn.addEventListener('keyup', (e) => {
      if (e.code === 'Space' || e.code === 'Enter') {
        e.preventDefault();
        releaseTorch();
      }
    });

    // Disable context menu on button
    torchBtn.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('contextmenu', (e) => {
      if (isPressed) e.preventDefault();
    });
  }

  // --- Lifecycle & Safety Handlers (Phase 6) ---
  function setupLifecycleSafety() {
    // Turn off when tab/app goes into background
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        releaseTorch();
      }
    });

    // Window blur or screen lock
    window.addEventListener('blur', () => {
      if (isPressed) {
        releaseTorch();
      }
    });

    // Page unload / navigation cleanup
    const cleanupResources = () => {
      releaseTorch();
      if (videoTrack) {
        videoTrack.stop();
      }
      if (mediaStream) {
        mediaStream.getTracks().forEach((t) => t.stop());
      }
    };

    window.addEventListener('pagehide', cleanupResources);
    window.addEventListener('beforeunload', cleanupResources);
  }

  // --- Diagnostics Information ---
  function updateDiagnosticsUI(caps = {}, settings = {}) {
    diagContext.textContent = window.isSecureContext ? 'Secure (HTTPS / localhost)' : 'Insecure (Restricted)';
    diagContext.style.color = window.isSecureContext ? '#10b981' : '#ef4444';

    diagMedia.textContent = navigator.mediaDevices ? 'Supported' : 'Not Supported';
    diagTorch.textContent = caps.torch ? 'Supported & Enabled' : 'Not Supported / Not Exposed';
    diagTorch.style.color = caps.torch ? '#10b981' : '#f59e0b';

    diagCamera.textContent = settings.facingMode ? `Camera (${settings.facingMode})` : (videoTrack ? videoTrack.label || 'Active Camera' : 'None');
    diagBrowser.textContent = navigator.userAgent.slice(0, 48) + '...';
  }

  function showFallbackDialog(msg) {
    if (msg) fallbackMessage.textContent = msg;
    fallbackModal.classList.remove('hidden');
  }

  // --- PWA Installation & Service Worker ---
  function setupPWA() {
    // Register Service Worker
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('./service-worker.js')
          .then((reg) => {
            console.log('[PWA] Service Worker registered with scope:', reg.scope);
          })
          .catch((err) => {
            console.warn('[PWA] Service Worker registration failed:', err);
          });
      });
    }

    // Capture install prompt
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      deferredInstallPrompt = e;
      installBtn.classList.remove('hidden');
    });

    installBtn.addEventListener('click', async () => {
      if (!deferredInstallPrompt) return;
      deferredInstallPrompt.prompt();
      const choiceResult = await deferredInstallPrompt.userChoice;
      if (choiceResult.outcome === 'accepted') {
        console.log('[PWA] User accepted installation prompt');
      }
      deferredInstallPrompt = null;
      installBtn.classList.add('hidden');
    });

    window.addEventListener('appinstalled', () => {
      installBtn.classList.add('hidden');
      console.log('[PWA] App successfully installed');
    });
  }

  // --- Event Listeners Initialization ---
  function initApp() {
    setupPointerEvents();
    setupLifecycleSafety();
    setupPWA();

    // Setup / Enable Button
    enableTorchBtn.addEventListener('click', () => {
      initCameraTorch();
    });

    // Mode Switcher Button
    modeToggleBtn.addEventListener('click', () => {
      toggleMode();
    });

    // Toolbar Controls
    hapticToggleBtn.addEventListener('click', () => {
      hapticsEnabled = !hapticsEnabled;
      hapticToggleBtn.classList.toggle('active', hapticsEnabled);
      if (hapticsEnabled) triggerHaptics('press');
    });

    soundToggleBtn.addEventListener('click', () => {
      soundEnabled = !soundEnabled;
      soundToggleBtn.classList.toggle('active', soundEnabled);
      if (soundEnabled) {
        initAudio();
        playClickSound('down');
      }
    });

    strobeToggleBtn.addEventListener('click', () => {
      strobeEnabled = !strobeEnabled;
      strobeToggleBtn.classList.toggle('active', strobeEnabled);
      triggerHaptics('press');
    });

    // Modals
    infoBtn.addEventListener('click', () => {
      updateDiagnosticsUI();
      infoModal.classList.remove('hidden');
    });

    closeInfoBtn.addEventListener('click', () => infoModal.classList.add('hidden'));
    okInfoBtn.addEventListener('click', () => infoModal.classList.add('hidden'));
    testScreenTorchBtn.addEventListener('click', () => {
      infoModal.classList.add('hidden');
      setScreenTorchMode();
    });

    closeFallbackBtn.addEventListener('click', () => fallbackModal.classList.add('hidden'));
    dismissFallbackBtn.addEventListener('click', () => fallbackModal.classList.add('hidden'));
    enableScreenModeBtn.addEventListener('click', () => setScreenTorchMode());

    // Close modals on clicking outside dialog
    window.addEventListener('click', (e) => {
      if (e.target === infoModal) infoModal.classList.add('hidden');
      if (e.target === fallbackModal) fallbackModal.classList.add('hidden');
    });

    // Check if permission already pre-granted in browser
    if (navigator.permissions && navigator.permissions.query) {
      navigator.permissions.query({ name: 'camera' })
        .then((permissionStatus) => {
          if (permissionStatus.state === 'granted') {
            // Permission previously granted, show prompt ready to init
            console.log('[Permission] Camera already granted by browser');
          }
        })
        .catch(() => {});
    }

    // Initial State
    checkSecureContext();
    updateUIState('idle');
    updateDiagnosticsUI();
  }

  // Bootstrap when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
  } else {
    initApp();
  }
})();
