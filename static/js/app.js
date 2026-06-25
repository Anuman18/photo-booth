/* ============================================================
   app.js — PhotoBooth_v2
   Modular, professional vanilla JS for the photo booth UI.
   ============================================================ */

"use strict";

/* ════════════════════════════════════════════════════════════
   MODULE: State
   Central application state — single source of truth.
   ════════════════════════════════════════════════════════════ */
const State = (() => {
  const _state = {
    stream: null,          // MediaStream from getUserMedia
    countdown: null,       // setInterval handle
    isCapturing: false,    // guard against double-taps
    currentScreen: "camera", // "camera" | "result"
  };

  return {
    get: (key) => _state[key],
    set: (key, val) => { _state[key] = val; },
  };
})();


/* ════════════════════════════════════════════════════════════
   MODULE: DOM — cached element references
   ════════════════════════════════════════════════════════════ */
const DOM = (() => {
  const cache = {};
  const ids = [
    "screenCamera", "screenResult",
    "videoFeed", "captureCanvas",
    "countdownOverlay", "countdownNumber",
    "flashOverlay", "cameraStatus",
    "captureBtn", "captureWrap", "captureHint",
    "resultPhoto", "qrCode", "downloadBtn",
    "retakeBtn", "nextGuestBtn",
    "processingOverlay", "errorToast",
  ];

  const init = () => {
    ids.forEach(id => {
      const el = document.getElementById(id);
      if (!el) console.warn(`[DOM] Element not found: #${id}`);
      cache[id] = el;
    });
  };

  const get = (id) => cache[id];

  return { init, get };
})();


/* ════════════════════════════════════════════════════════════
   MODULE: Camera — webcam lifecycle management
   ════════════════════════════════════════════════════════════ */
const Camera = (() => {

  /**
   * Start the webcam and pipe it into the <video> element.
   * Requests the highest available resolution; object-fit:cover
   * handles cropping so faces are never stretched.
   */
  const start = async () => {
    const video = DOM.get("videoFeed");
    const status = DOM.get("cameraStatus");

    // Show loading state
    status.classList.remove("hidden");

    const constraints = {
      video: {
        facingMode: "user",
        width:  { ideal: 1920 },
        height: { ideal: 1080 },
        frameRate: { ideal: 30 },
      },
      audio: false,
    };

    try {
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      State.set("stream", stream);
      video.srcObject = stream;

      // Hide status once video is playing
      video.onloadedmetadata = () => {
        video.play().then(() => {
          status.classList.add("hidden");
        });
      };
    } catch (err) {
      console.error("[Camera] getUserMedia failed:", err);
      status.innerHTML =
        `<p style="color:#ff3b30;padding:16px;text-align:center;">
           Camera access denied.<br>Please allow camera permissions and refresh.
         </p>`;
    }
  };

  /**
   * Stop all camera tracks and clear the video source.
   */
  const stop = () => {
    const stream = State.get("stream");
    if (stream) {
      stream.getTracks().forEach(t => t.stop());
      State.set("stream", null);
    }
    const video = DOM.get("videoFeed");
    if (video) video.srcObject = null;
  };

  /**
   * Grab the current frame from the <video> element.
   * Returns a base64-encoded PNG data URL.
   * NOTE: We un-mirror here so the saved image is NOT flipped.
   */
  const captureFrame = () => {

    const video = DOM.get("videoFeed");
    const canvas = DOM.get("captureCanvas");

    const vw = video.videoWidth;
    const vh = video.videoHeight;

    console.log("Video Size:", vw, vh);

    if (vw === 0 || vh === 0) {
        throw new Error("Camera not ready.");
    }

    canvas.width = vw;
    canvas.height = vh;

    const ctx = canvas.getContext("2d");

    ctx.save();
    ctx.translate(vw, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, 0, 0, vw, vh);
    ctx.restore();

    const data = canvas.toDataURL("image/png");

    console.log("Image:", data.substring(0, 50));

    return data;
};

  return { start, stop, captureFrame };
})();


/* ════════════════════════════════════════════════════════════
   MODULE: Countdown — animated 3-2-1 overlay
   ════════════════════════════════════════════════════════════ */
const Countdown = (() => {

  /**
   * Run the countdown from `from` down to 1, then call `onDone`.
   * Each tick animates the number with a pop effect.
   */
  const run = (from, onDone) => {
    const overlay = DOM.get("countdownOverlay");
    const numEl   = DOM.get("countdownNumber");
    let count = from;

    overlay.classList.add("active");

    const tick = () => {
      if (count < 1) {
        // Countdown finished
        overlay.classList.remove("active");
        numEl.textContent = "";
        numEl.classList.remove("pop");
        onDone();
        return;
      }

      numEl.classList.remove("pop");
      // Force reflow to restart animation
      void numEl.offsetWidth;
      numEl.textContent = count;
      numEl.classList.add("pop");

      count--;
      // Duration matches @keyframes countdown-pop (0.85s)
      State.set("countdown", setTimeout(tick, 850));
    };

    tick();
  };

  /** Cancel a running countdown if the user navigates away. */
  const cancel = () => {
    const handle = State.get("countdown");
    if (handle) clearTimeout(handle);

    const overlay = DOM.get("countdownOverlay");
    const numEl   = DOM.get("countdownNumber");
    if (overlay) overlay.classList.remove("active");
    if (numEl)   { numEl.textContent = ""; numEl.classList.remove("pop"); }
  };

  return { run, cancel };
})();


/* ════════════════════════════════════════════════════════════
   MODULE: Flash — white flash effect on capture
   ════════════════════════════════════════════════════════════ */
const Flash = (() => {
  const fire = () => {
    const el = DOM.get("flashOverlay");
    el.classList.remove("flash");
    void el.offsetWidth; // reflow
    el.classList.add("flash");
  };
  return { fire };
})();


/* ════════════════════════════════════════════════════════════
   MODULE: UI — screen switching, loading, toast
   ════════════════════════════════════════════════════════════ */
const UI = (() => {

  /**
   * Switch between "camera" and "result" screens with a fade.
   */
  const showScreen = (name) => {
    const cameraScreen = DOM.get("screenCamera");
    const resultScreen = DOM.get("screenResult");
    const captureWrap  = DOM.get("captureWrap");

    if (name === "camera") {
      cameraScreen.removeAttribute("aria-hidden");
      resultScreen.setAttribute("aria-hidden", "true");
      captureWrap.style.display = "";
      cameraScreen.classList.add("screen--fade-in");
    } else {
      cameraScreen.setAttribute("aria-hidden", "true");
      resultScreen.removeAttribute("aria-hidden");
      captureWrap.style.display = "none";
      resultScreen.classList.add("screen--fade-in");
    }

    State.set("currentScreen", name);
  };

  /** Show/hide the full-page processing overlay. */
  const setProcessing = (active) => {
    const el = DOM.get("processingOverlay");
    if (active) {
      el.classList.add("active");
      el.removeAttribute("aria-hidden");
    } else {
      el.classList.remove("active");
      el.setAttribute("aria-hidden", "true");
    }
  };

  /** Enable / disable the capture button. */
  const setCaptureEnabled = (enabled) => {
    DOM.get("captureBtn").disabled = !enabled;
  };

  /**
   * Show an error toast for `duration` milliseconds.
   */
  const showToast = (message, duration = 4000) => {
    const toast = DOM.get("errorToast");
    toast.textContent = message;
    toast.classList.add("visible");
    setTimeout(() => toast.classList.remove("visible"), duration);
  };

  /** Populate the result screen with the final photo and QR. */
  const populateResult = ({ photo_url, qr_url, download_url }) => {
    DOM.get("resultPhoto").src  = photo_url;
    DOM.get("qrCode").src       = qr_url;
    DOM.get("downloadBtn").href = download_url;
  };

  return { showScreen, setProcessing, setCaptureEnabled, showToast, populateResult };
})();


/* ════════════════════════════════════════════════════════════
   MODULE: API — communicates with Flask backend
   ════════════════════════════════════════════════════════════ */
const API = (() => {

  /**
   * POST a base64 image to /capture, receive URLs back.
   * @param {string} imageDataURL — canvas.toDataURL() result
   * @returns {Promise<Object>} — { photo_url, qr_url, download_url }
   */
  const sendCapture = async (imageDataURL) => {
    const response = await fetch("/capture", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ image: imageDataURL }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error || `Server error ${response.status}`);
    }

    return response.json();
  };

  return { sendCapture };
})();


/* ════════════════════════════════════════════════════════════
   MODULE: Booth — main workflow orchestration
   ════════════════════════════════════════════════════════════ */
const Booth = (() => {

  /**
   * Full capture flow:
   * 1. Disable button
   * 2. Run 3-2-1 countdown
   * 3. Flash + grab frame
   * 4. POST to backend
   * 5. Display result
   */
  const capture = () => {

    if (State.get("isCapturing")) return;

    State.set("isCapturing", true);

    UI.setCaptureEnabled(false);

    const btn = DOM.get("captureBtn");
    btn.innerHTML = "⏳ Processing...";

    Countdown.run(3, async () => {

        Flash.fire();

        const frameDataURL = Camera.captureFrame();

        UI.setProcessing(true);

        try {

            const result = await API.sendCapture(frameDataURL);

            UI.populateResult(result);

            UI.showScreen("result");

        } catch (err) {

            console.error("[Booth] Capture failed:", err);

            UI.showToast(`Capture failed: ${err.message}`);

        } finally {

            UI.setProcessing(false);

            btn.innerHTML = "📸 Capture";

            UI.setCaptureEnabled(true);

            State.set("isCapturing", false);

        }

    });

};

  /**
   * Retake: go back to live camera view.
   * Camera is still running so we just switch screens.
   */
  const retake = () => {
    DOM.get("resultPhoto").src = "";
    DOM.get("qrCode").src      = "";
    DOM.get("downloadBtn").href = "#";
    UI.showScreen("camera");
    UI.setCaptureEnabled(true);
    const btn = DOM.get("captureBtn");
    btn.innerHTML = "📸 Capture";
    UI.setCaptureEnabled(true);
    State.set("isCapturing", false);
  };

  /**
   * Next guest: full reset.
   * Stop & restart the camera for a clean slate.
   */
  const nextGuest = async () => {
    Camera.stop();
    retake();
    await Camera.start();
  };

  return { capture, retake, nextGuest };
})();


/* ════════════════════════════════════════════════════════════
   MODULE: Keyboard shortcuts
   ════════════════════════════════════════════════════════════ */
const Keyboard = (() => {
  const init = () => {
    document.addEventListener("keydown", (e) => {
      // Space → Capture (only on camera screen, no modifier keys)
      if (
        e.code === "Space" &&
        !e.ctrlKey && !e.altKey && !e.metaKey &&
        State.get("currentScreen") === "camera"
      ) {
        e.preventDefault();
        Booth.capture();
      }

      // F11 → Fullscreen
      if (e.code === "F11") {
        e.preventDefault();
        if (!document.fullscreenElement) {
          document.documentElement.requestFullscreen().catch(() => {});
        }
      }

      // Esc → Exit fullscreen (browser also handles this, but just in case)
      if (e.code === "Escape" && document.fullscreenElement) {
        document.exitFullscreen().catch(() => {});
      }
    });
  };

  return { init };
})();


/* ════════════════════════════════════════════════════════════
   MODULE: Events — bind UI interactions
   ════════════════════════════════════════════════════════════ */
const Events = (() => {
  const init = () => {
    // Capture button
    DOM.get("captureBtn").addEventListener("click", () => {
      Booth.capture();
    });

    // Retake button
    DOM.get("retakeBtn").addEventListener("click", () => {
      Booth.retake();
    });

    // Next guest button
    DOM.get("nextGuestBtn").addEventListener("click", () => {
      Booth.nextGuest();
    });
  };

  return { init };
})();


/* ════════════════════════════════════════════════════════════
   INIT — bootstrap the application
   ════════════════════════════════════════════════════════════ */
document.addEventListener("DOMContentLoaded", async () => {
  // 1. Cache DOM references
  DOM.init();

  // 2. Bind event listeners
  Events.init();

  // 3. Register keyboard shortcuts
  Keyboard.init();

  // 4. Show camera screen
  UI.showScreen("camera");

  // 5. Start webcam
  await Camera.start();


  console.info("[PhotoBooth_v2] Ready ✓");
});
