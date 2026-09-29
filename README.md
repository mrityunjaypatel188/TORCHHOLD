# 🔦 Touch & Hold Flashlight Web App (PWA)

A mobile-first, tactile web application where your smartphone's camera LED flashlight stays **ON** only while touching/pressing the primary button (bike horn / dipper style), and instantly switches **OFF** upon release.

Built strictly according to [`Implementation_Plan.docx`](file:///c:/Users/mrity/OneDrive/Desktop/flashlight/Implementation_Plan.docx).

---

## 🌟 Key Features

1. **Touch-and-Hold Logic (Bike Horn / Dipper Style)**:
   - Uses Pointer Events (`pointerdown`, `pointerup`, `pointercancel`, `lostpointercapture`) with pointer capture.
   - Flashlight turns **ON** on press and turns **OFF** immediately upon releasing or dragging finger away.
   - Rapid-tap concurrency queue prevents race conditions and ensures the hardware always turns off.
2. **One-Time Permission Setup (No Repeated Prompts)**:
   - Explicit "Enable Flashlight" action initializes the camera stream once.
   - Reuses the active `MediaStreamTrack` throughout the session without prompting again.
3. **Screen Torch Mode (Universal Fallback)**:
   - For devices or browsers that do not expose hardware torch control to WebRTC (such as iOS Safari or desktop laptops), seamlessly switches to a pure white high-brightness screen flashlight with Screen Wake Lock.
4. **Haptic & Tactical Audio Feedback**:
   - Synthesized mechanical click sounds via Web Audio API (zero external audio files needed).
   - Haptic vibration feedback on press and release.
5. **Strobe / Emergency Beacon Mode**:
   - Optional strobe toggle for flashing pulses while held.
6. **Safety & Lifecycle Handling**:
   - Turns off automatically when switching tabs (`visibilitychange`), screen locks, or navigating away (`pagehide`).
7. **Progressive Web App (PWA)**:
   - Installable on Android & iOS homescreens via `manifest.webmanifest` & `service-worker.js`.
   - Works offline with Cache-First asset strategy.

---

## 🚀 Environment Setup & Running (वातावरण और चलाने का तरीका)

The development environment includes an automated Python server with LAN IP detection, terminal QR code generation, and optional self-signed HTTPS.

### Option 1: 1-Click Launch (Windows)

Simply double-click:
```cmd
start.bat
```
Or for secure HTTPS (recommended for mobile LAN testing):
```cmd
start.bat --https
```

### Option 2: PowerShell

```powershell
.\start.ps1
# Or with HTTPS:
.\start.ps1 -Https
```

### Option 3: Manual Python Setup

1. **Activate virtual environment:**
   ```powershell
   .\.venv\Scripts\Activate.ps1
   ```
2. **Install requirements:**
   ```powershell
   pip install -r requirements.txt
   ```
3. **Run Dev Server:**
   ```powershell
   python server.py
   # Or with HTTPS:
   python server.py --https
   ```

When the server starts:
- **Local PC URL:** `http://localhost:8000`
- **Mobile LAN URL:** `http://<your-lan-ip>:8000` (e.g. `http://10.58.92.240:8000`)
- An **ASCII QR Code** will appear directly in your terminal. You can scan it with your phone's camera!

---

## 📱 Mobile Device Testing Guide (मोबाइल पर टेस्ट कैसे करें)

### 1. Android (Google Chrome / Edge)
- **Localhost:** If testing via USB cable with Chrome DevTools port forwarding (`adb reverse tcp:8000 tcp:8000`), open `http://localhost:8000`. Chrome treats `localhost` as a Secure Context and hardware torch works natively!
- **Over Wi-Fi (LAN):**
  - Run the server in HTTPS mode: `python server.py --https`. Open `https://<your-lan-ip>:8000`, accept the self-signed certificate, and grant camera permission.
  - Or in Chrome on Android: navigate to `chrome://flags/#unsafely-treat-insecure-origin-as-secure`, enter `http://<your-lan-ip>:8000`, enable it, and relaunch Chrome.

### 2. iPhone / iPad (iOS Safari)
- Apple Safari restricts direct hardware LED torch control via WebRTC for web applications.
- The app automatically detects this and offers **Screen Torch Mode**, which turns the whole iPhone display into an ultra-bright white flashlight on hold!

---

## 📂 Project Structure

```text
flashlight/
├── Implementation_Plan.docx   # Original specification
├── Implementation_Plan.txt    # Extracted specification text
├── index.html                 # Mobile-first semantic UI & modals
├── style.css                  # OLED dark theme & tactical button styling
├── app.js                     # Core torch logic, pointer events, queue & PWA
├── manifest.webmanifest       # PWA manifest
├── service-worker.js          # Offline caching service worker
├── icons/
│   ├── icon-192.png           # 192x192 PWA Icon
│   ├── icon-512.png           # 512x512 PWA Icon
│   └── icon.svg               # Vector SVG Icon
├── server.py                  # Dev server (LAN IP, QR code, HTTPS)
├── requirements.txt           # Python dependencies
├── start.bat                  # Windows batch launcher
├── start.ps1                  # PowerShell launcher
└── README.md                  # Documentation
```

---

## 🛡️ Privacy & Safety
- **No Video Saved or Uploaded:** The camera stream is used solely to interact with the device's physical LED torch via the browser constraint API. No video or photo is ever recorded, stored, or sent to any server.
- **Fail-Safe Release:** Pointer loss, system dialogs, app switching, or finger sliding off the button instantly triggers an emergency torch shutoff.
