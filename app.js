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

// ── Ambient Focus Music — Ocean Waves (procedural, no external files) ──
let musicEnabled = false;
let musicPlaying = false;
let musicNodes = null; // { sources, scriptNode, master, waveTimers }

const btnMusic = document.getElementById("btnMusic");

// Create a buffer of white noise (reusable)
function createNoiseBuffer(duration) {
  const sampleRate = audioCtx.sampleRate;
  const length = sampleRate * duration;
  const buffer = audioCtx.createBuffer(1, length, sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) {
    data[i] = Math.random() * 2 - 1;
  }
  return buffer;
}

// Schedule a single wave crash with slow rise and gentle fall
function scheduleWave(noiseBuffer, master, delay, duration, peakGain, filterPeak) {
  const source = audioCtx.createBufferSource();
  source.buffer = noiseBuffer;
  source.loop = true;

  // Bandpass filter — gives the "shhh" ocean character
  const bp = audioCtx.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.value = 400;
  bp.Q.value = 0.4;

  // Highshelf cut — removes harsh high end
  const shelf = audioCtx.createBiquadFilter();
  shelf.type = "highshelf";
  shelf.frequency.value = 3000;
  shelf.gain.value = -8;

  // Volume envelope: silence → slow rise → peak → gentle fall
  const env = audioCtx.createGain();
  env.gain.value = 0;

  const t0 = audioCtx.currentTime + delay;
  const rise = duration * 0.4;
  const fall = duration * 0.6;

  env.gain.setValueAtTime(0, t0);
  env.gain.linearRampToValueAtTime(peakGain, t0 + rise);
  env.gain.exponentialRampToValueAtTime(0.001, t0 + rise + fall);

  // Filter sweep: low → high on crash → low on recede
  bp.frequency.setValueAtTime(300, t0);
  bp.frequency.linearRampToValueAtTime(filterPeak, t0 + rise);
  bp.frequency.exponentialRampToValueAtTime(200, t0 + rise + fall);

  source.connect(bp);
  bp.connect(shelf);
  shelf.connect(env);
  env.connect(master);

  source.start(t0);
  source.stop(t0 + duration + 0.1);

  return source;
}

function createAmbientMusic() {
  initAudio();

  const master = audioCtx.createGain();
  master.gain.value = 0;
  master.connect(audioCtx.destination);

  // Fade in the master over 2 seconds
  master.gain.setValueAtTime(0, audioCtx.currentTime);
  master.gain.linearRampToValueAtTime(1, audioCtx.currentTime + 2);

  // Shared noise buffer (10 seconds, looped)
  const noiseBuffer = createNoiseBuffer(10);

  // Low rumble — filtered brownian noise for deep ocean bed
  const rumbleSource = audioCtx.createBufferSource();
  rumbleSource.buffer = noiseBuffer;
  rumbleSource.loop = true;
  const rumbleLp = audioCtx.createBiquadFilter();
  rumbleLp.type = "lowpass";
  rumbleLp.frequency.value = 150;
  rumbleLp.Q.value = 0.5;
  const rumbleGain = audioCtx.createGain();
  rumbleGain.gain.value = 0.12;
  rumbleSource.connect(rumbleLp);
  rumbleLp.connect(rumbleGain);
  rumbleGain.connect(master);
  rumbleSource.start();

  const sources = [rumbleSource];
  const waveTimers = [];

  // Wave layer — schedule overlapping waves on a loop
  function spawnWaveLayer(minInterval, maxInterval, minDur, maxDur, gain, filterPeak) {
    function next() {
      if (!musicPlaying) return;
      const duration = minDur + Math.random() * (maxDur - minDur);
      const peakGain = gain * (0.7 + Math.random() * 0.3);
      const src = scheduleWave(noiseBuffer, master, 0, duration, peakGain, filterPeak);
      sources.push(src);
      const interval = minInterval + Math.random() * (maxInterval - minInterval);
      const timer = setTimeout(next, interval * 1000);
      waveTimers.push(timer);
    }
    next();
  }

  // Big slow waves (8-12s cycle)
  spawnWaveLayer(6, 10, 6, 10, 0.27, 800);
  // Medium waves (5-8s cycle)
  spawnWaveLayer(4, 7, 4, 7, 0.15, 600);
  // Small ripples (3-5s cycle)
  spawnWaveLayer(2, 4, 2, 4, 0.075, 500);

  musicNodes = { sources, master, waveTimers };
  musicPlaying = true;
}

function stopAmbientMusic(fadeOut) {
  if (!musicNodes || !musicPlaying) return;

  const { sources, master, waveTimers } = musicNodes;
  const fadeTime = fadeOut ? 2 : 0.05;

  musicPlaying = false;

  // Stop scheduling new waves
  waveTimers.forEach(t => clearTimeout(t));

  master.gain.setValueAtTime(master.gain.value, audioCtx.currentTime);
  master.gain.linearRampToValueAtTime(0, audioCtx.currentTime + fadeTime);

  // Clean up nodes after fade
  setTimeout(() => {
    sources.forEach(s => { try { s.stop(); } catch (_) {} });
    musicNodes = null;
  }, fadeTime * 1000 + 100);
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
