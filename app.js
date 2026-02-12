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

// ── Timer controls ──
function start() {
  isRunning = true;
  btnStart.textContent = "Pause";
  btnStart.classList.add("running");
  btnReset.disabled = false;
  card.classList.add("running");
  setInputsDisabled(true);

  timerInterval = setInterval(() => {
    remainingSeconds--;
    render();

    if (remainingSeconds <= 0) {
      complete();
    }
  }, 1000);
}

function stop() {
  isRunning = false;
  clearInterval(timerInterval);
  timerInterval = null;
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
  stop();
  playNotification();

  if (currentMode === "focus") {
    sessions++;
    sessionEl.textContent = `${sessions} session${sessions !== 1 ? "s" : ""}`;
    addHistory(`Focus session #${sessions} completed`);
  } else {
    addHistory(`${MODES[currentMode].label} finished`);
  }

  // Auto-suggest next mode
  if (currentMode === "focus") {
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

// ── Sound notification ──
function playNotification() {
  const ctx = new (window.AudioContext || window.webkitAudioContext)();

  // Play three short beeps
  [0, 0.2, 0.4].forEach(delay => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.type = "sine";
    osc.frequency.value = 880;
    gain.gain.value = 0.3;
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + delay + 0.15);

    osc.start(ctx.currentTime + delay);
    osc.stop(ctx.currentTime + delay + 0.15);
  });
}

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
