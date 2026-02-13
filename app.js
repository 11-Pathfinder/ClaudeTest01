// ── Config ──
const MODES = {
  focus:  { minutes: 25, label: "Time to focus" },
  short:  { minutes: 5,  label: "Short break" },
  long:   { minutes: 15, label: "Long break" },
};

// ── State ──
let currentMode = "focus";
let totalSeconds = MODES.focus.minutes * 60;
let remainingSeconds = totalSeconds;
let timerInterval = null;
let isRunning = false;
let sessions = 0;
let targetEndTime = null; // timestamp when timer should finish

// ── Audio context (must be created on user gesture for mobile) ──
let audioCtx = null;

// ── DOM ──
const display   = document.getElementById("timerDisplay");
const label     = document.getElementById("timerLabel");
const card      = document.getElementById("timerCard");
const btnStart  = document.getElementById("btnStart");
const btnReset  = document.getElementById("btnReset");
const sessionEl = document.getElementById("sessionCount");
const history   = document.getElementById("history");
const tabs      = document.querySelectorAll(".tab");
const focusInput = document.getElementById("focusMin");
const shortInput = document.getElementById("shortMin");
const longInput  = document.getElementById("longMin");
const durationInputs = { focus: focusInput, short: shortInput, long: longInput };

// ── Format time as MM:SS ──
function formatTime(seconds) {
  const m = Math.floor(seconds / 60).toString().padStart(2, "0");
  const s = (seconds % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

// ── Update the display ──
function render() {
  display.textContent = formatTime(remainingSeconds);
  document.title = `${formatTime(remainingSeconds)} - Pomodoro`;
}

// ── Toggle duration inputs ──
function setInputsDisabled(disabled) {
  focusInput.disabled = disabled;
  shortInput.disabled = disabled;
  longInput.disabled = disabled;
}

// ── Switch modes ──
function setMode(mode) {
  if (isRunning) stop();

  currentMode = mode;
  totalSeconds = MODES[mode].minutes * 60;
  remainingSeconds = totalSeconds;
  label.textContent = MODES[mode].label;

  tabs.forEach(t => t.classList.toggle("active", t.dataset.mode === mode));

  btnStart.textContent = "Start";
  btnStart.classList.remove("running");
  btnReset.disabled = true;
  card.classList.remove("running");
  setInputsDisabled(false);

  render();
}

// ── Notifications ──
function requestNotificationPermission() {
  if ("Notification" in window && Notification.permission === "default") {
    Notification.requestPermission();
  }
}

function scheduleServiceWorkerNotification(seconds, mode) {
  if ("serviceWorker" in navigator && navigator.serviceWorker.controller) {
    navigator.serviceWorker.controller.postMessage({
      type: "SCHEDULE_NOTIFICATION",
      delay: seconds * 1000,
      mode: mode,
    });
  }
}

function cancelServiceWorkerNotification() {
  if ("serviceWorker" in navigator && navigator.serviceWorker.controller) {
    navigator.serviceWorker.controller.postMessage({
      type: "CANCEL_NOTIFICATION",
    });
  }
}

// ── Timer controls ──
function start() {
  isRunning = true;
  btnStart.textContent = "Pause";
  btnStart.classList.add("running");
  btnReset.disabled = false;
  card.classList.add("running");
  setInputsDisabled(true);

  // Initialize audio context on user gesture (fixes mobile sound)
  initAudio();
  // Request notification permission on first start (user gesture)
  requestNotificationPermission();

  // Start ambient music if enabled and in focus mode
  if (musicEnabled && currentMode === "focus" && !musicPlaying) {
    createAmbientMusic();
  }

  // Set the target end time based on remaining seconds
  targetEndTime = Date.now() + remainingSeconds * 1000;

  // Schedule a backup notification via service worker (works with screen off)
  scheduleServiceWorkerNotification(remainingSeconds, currentMode);

  timerInterval = setInterval(() => {
    const now = Date.now();
    remainingSeconds = Math.round((targetEndTime - now) / 1000);

    if (remainingSeconds <= 0) {
      remainingSeconds = 0;
      render();
      complete();
    } else {
      render();
    }
  }, 250); // tick faster to catch up after screen wake
}

function stop() {
  isRunning = false;
  clearInterval(timerInterval);
  timerInterval = null;
  targetEndTime = null;
  cancelServiceWorkerNotification();
  stopAmbientMusic(true);
  btnStart.textContent = "Resume";
  btnStart.classList.remove("running");
  card.classList.remove("running");
  setInputsDisabled(false);
}

function reset() {
  stop();
  remainingSeconds = totalSeconds;
  btnStart.textContent = "Start";
  btnReset.disabled = true;
  render();
}

function complete() {
  const completedMode = currentMode;
  stop();
  playNotification();
  showCompletionNotification(completedMode);

  if (completedMode === "focus") {
    sessions++;
    sessionEl.textContent = `${sessions} session${sessions !== 1 ? "s" : ""}`;
    addHistory(`Focus session #${sessions} completed`);
  } else {
    addHistory(`${MODES[completedMode].label} finished`);
  }

  // Auto-suggest next mode
  if (completedMode === "focus") {
    setMode(sessions % 4 === 0 ? "long" : "short");
  } else {
    setMode("focus");
  }
}

// ── History (session log) ──
function addHistory(text) {
  const now = new Date();
  const timeStr = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  const msg = document.createElement("div");
  msg.className = "history-msg";

  const label = document.createElement("span");
  label.textContent = text;

  const time = document.createElement("span");
  time.className = "time";
  time.textContent = timeStr;

  msg.appendChild(label);
  msg.appendChild(time);
  history.appendChild(msg);

  msg.scrollIntoView({ behavior: "smooth" });
}

// ── Audio (initialize on first user gesture for mobile compatibility) ──
function initAudio() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  // Resume if suspended (mobile browsers suspend until user gesture)
  if (audioCtx.state === "suspended") {
    audioCtx.resume();
  }
}

function playNotification() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (audioCtx.state === "suspended") {
    audioCtx.resume();
  }

  // Play three short beeps
  [0, 0.2, 0.4].forEach(delay => {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);

    osc.type = "sine";
    osc.frequency.value = 880;
    gain.gain.value = 0.3;
    gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + delay + 0.15);

    osc.start(audioCtx.currentTime + delay);
    osc.stop(audioCtx.currentTime + delay + 0.15);
  });
}

// ── System notification (visible even with screen off) ──
function showCompletionNotification(mode) {
  if ("Notification" in window && Notification.permission === "granted") {
    const title = mode === "focus" ? "Focus session complete!" : "Break is over!";
    const body = mode === "focus" ? "Time to take a break." : "Ready to focus again?";
    // Use service worker registration for better background support
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.ready.then(reg => {
        reg.showNotification(title, { body, icon: "icon-192.png", tag: "pomodoro-complete" });
      });
    } else {
      new Notification(title, { body, icon: "icon-192.png" });
    }
  }
}

// ── Ambient Focus Music (procedural, no external files) ──
let musicEnabled = false;
let musicPlaying = false;
let musicNodes = null; // { oscs, gains, filter, lfo, lfoGain, master }

const btnMusic = document.getElementById("btnMusic");

function createAmbientMusic() {
  initAudio(); // always ensure context exists and is resumed

  const master = audioCtx.createGain();
  master.gain.value = 0; // start silent, fade in
  master.connect(audioCtx.destination);

  // Low-pass filter for warmth (higher cutoff so laptop speakers can hear it)
  const filter = audioCtx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 800;
  filter.Q.value = 0.7;
  filter.connect(master);

  // LFO to gently sweep the filter cutoff (breathing effect)
  const lfo = audioCtx.createOscillator();
  const lfoGain = audioCtx.createGain();
  lfo.type = "sine";
  lfo.frequency.value = 0.05; // very slow sweep
  lfoGain.gain.value = 300;   // sweeps cutoff +/- 300Hz around 800
  lfo.connect(lfoGain);
  lfoGain.connect(filter.frequency);
  lfo.start();

  // Warm chord: C4, E4, G4, C5 — detuned triangle oscillators
  // Pitched up one octave so laptop speakers reproduce them well
  const notes = [261.63, 329.63, 392.00, 523.25];
  const detunes = [-5, 3, -3, 6]; // subtle detuning in cents
  const oscs = [];
  const gains = [];

  notes.forEach((freq, i) => {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();

    osc.type = "triangle";
    osc.frequency.value = freq;
    osc.detune.value = detunes[i];

    // Lower volume for higher notes to keep the sound grounded
    gain.gain.value = i < 2 ? 0.25 : 0.12;

    osc.connect(gain);
    gain.connect(filter);
    osc.start();

    oscs.push(osc);
    gains.push(gain);
  });

  // Gentle high shimmer — sine one octave above for sparkle
  const shimmer = audioCtx.createOscillator();
  const shimmerGain = audioCtx.createGain();
  shimmer.type = "sine";
  shimmer.frequency.value = 1046.50; // C6
  shimmerGain.gain.value = 0.03;
  shimmer.connect(shimmerGain);
  shimmerGain.connect(filter);
  shimmer.start();
  oscs.push(shimmer);
  gains.push(shimmerGain);

  // Fade in over 2 seconds
  master.gain.setValueAtTime(0, audioCtx.currentTime);
  master.gain.linearRampToValueAtTime(0.22, audioCtx.currentTime + 2);

  musicNodes = { oscs, gains, filter, lfo, lfoGain, master };
  musicPlaying = true;
}

function stopAmbientMusic(fadeOut) {
  if (!musicNodes || !musicPlaying) return;

  const { oscs, lfo, master } = musicNodes;
  const fadeTime = fadeOut ? 1.5 : 0.05;

  master.gain.setValueAtTime(master.gain.value, audioCtx.currentTime);
  master.gain.linearRampToValueAtTime(0, audioCtx.currentTime + fadeTime);

  // Clean up nodes after fade
  setTimeout(() => {
    oscs.forEach(o => { try { o.stop(); } catch (_) {} });
    try { lfo.stop(); } catch (_) {}
    musicNodes = null;
  }, fadeTime * 1000 + 100);

  musicPlaying = false;
}

function toggleMusic() {
  musicEnabled = !musicEnabled;
  btnMusic.classList.toggle("active", musicEnabled);

  if (musicEnabled && isRunning && currentMode === "focus") {
    createAmbientMusic();
  } else if (!musicEnabled) {
    stopAmbientMusic(true);
  }
}

btnMusic.addEventListener("click", toggleMusic);

// ── Catch up timer when app regains visibility (screen wake / tab focus) ──
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && isRunning && targetEndTime) {
    const now = Date.now();
    remainingSeconds = Math.round((targetEndTime - now) / 1000);
    if (remainingSeconds <= 0) {
      remainingSeconds = 0;
      render();
      complete();
    } else {
      render();
    }
  }
});

// ── Event Listeners ──
btnStart.addEventListener("click", () => {
  isRunning ? stop() : start();
});

btnReset.addEventListener("click", reset);

tabs.forEach(tab => {
  tab.addEventListener("click", () => setMode(tab.dataset.mode));
});

// ── Duration input listeners ──
Object.entries(durationInputs).forEach(([mode, input]) => {
  input.addEventListener("change", () => {
    let val = parseInt(input.value, 10);
    if (isNaN(val) || val < 1) val = 1;
    if (val > parseInt(input.max, 10)) val = parseInt(input.max, 10);
    input.value = val;
    MODES[mode].minutes = val;
    if (currentMode === mode && !isRunning) {
      totalSeconds = val * 60;
      remainingSeconds = totalSeconds;
      render();
    }
  });
});

// ── Init ──
render();
