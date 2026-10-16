/* Kopfrechnen – Spiellogik
 * Teil 1: reine Logik (ohne DOM, testbar mit Node)
 * Teil 2: Oberfläche und Spielablauf (nur im Browser)
 */

// ---------- Konstanten ----------
const ROUND_LENGTH = 10;      // Aufgaben pro Runde
const TIME_LIMIT_MS = 10000;  // Zeit pro Aufgabe
const FEEDBACK_MS = 800;      // Dauer der Rückmeldung
const MAX_OPERAND = 99;       // Zahlen in der Aufgabe: 0–99
const HIGHSCORE_KEY = "kopfrechnen-highscore";

// ---------- Teil 1: Logik ----------

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/** Neue Aufgabe erzeugen, die sich vom Text `previousText` unterscheidet. */
function generateQuestion(previousText) {
  let q;
  do {
    const isAdd = Math.random() < 0.5;
    let a = randInt(0, MAX_OPERAND);
    let b = randInt(0, MAX_OPERAND);
    if (!isAdd && b > a) [a, b] = [b, a]; // grössere Zahl vorne -> nie negativ
    q = {
      a, b,
      op: isAdd ? "+" : "−",
      answer: isAdd ? a + b : a - b,
    };
    q.text = `${a} ${q.op} ${b}`;
  } while (q.text === previousText);
  return q;
}

/** Ziffern einer Zahl vertauschen (47 -> 74). Gibt null zurück, wenn nicht sinnvoll. */
function swapDigits(n) {
  if (n < 10) return null;
  const s = String(n);
  return Number(s.slice(1) + s[0]) ;
}

/**
 * Liefert 4 verschiedene, nicht-negative Antworten (genau eine richtige)
 * und den zufälligen Index der richtigen Antwort.
 */
function generateOptions(correct) {
  // Plausible Fehlerkandidaten
  const candidates = [
    correct + 1, correct - 1, correct + 2, correct - 2,
    correct + 10, correct - 10, swapDigits(correct),
  ];
  const wrong = [];
  const ok = (v) => v !== null && v >= 0 && v !== correct && !wrong.includes(v);

  // Zufällig mischen und die ersten 3 gültigen nehmen
  shuffle(candidates);
  for (const c of candidates) {
    if (wrong.length === 3) break;
    if (ok(c)) wrong.push(c);
  }
  // Notfall (z. B. bei Ergebnis 0): weiter entfernte Werte auffüllen
  for (let d = 3; wrong.length < 3; d++) {
    for (const c of [correct + d, correct - d]) {
      if (wrong.length < 3 && ok(c)) wrong.push(c);
    }
  }

  const options = shuffle([correct, ...wrong]);
  return { options, correctIndex: options.indexOf(correct) };
}

/** Fisher-Yates-Mischen (verändert das Array und gibt es zurück). */
function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = randInt(0, i);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/** Punkte für eine Antwort: falsch = 0, richtig = max(10, round(100 × (1 − t/10 s))). */
function calcPoints(isCorrect, timeMs) {
  if (!isCorrect) return 0;
  return Math.max(10, Math.round(100 * (1 - timeMs / TIME_LIMIT_MS)));
}

// Für Tests unter Node exportieren
if (typeof module !== "undefined" && module.exports) {
  module.exports = { generateQuestion, generateOptions, calcPoints, swapDigits, ROUND_LENGTH };
}

// ---------- Teil 2: Oberfläche (nur im Browser) ----------
if (typeof document !== "undefined") {
  const $ = (id) => document.getElementById(id);
  const screens = { start: $("screen-start"), game: $("screen-game"), end: $("screen-end") };
  const answerButtons = Array.from(document.querySelectorAll(".answer"));

  // Spielzustand
  let state = null;       // { index, score, correctCount, times[], question, correctIndex, startTime, answered, lastText }
  let rafId = null;       // requestAnimationFrame-ID für den Zeitbalken
  let nextTimeout = null; // Timeout bis zur nächsten Aufgabe

  function showScreen(name) {
    for (const [key, el] of Object.entries(screens)) el.classList.toggle("active", key === name);
  }

  function getHighscore() {
    try { return Number(localStorage.getItem(HIGHSCORE_KEY)) || 0; } catch { return 0; }
  }
  function setHighscore(v) {
    try { localStorage.setItem(HIGHSCORE_KEY, String(v)); } catch { /* ignorieren */ }
  }

  function startGame() {
    state = { index: 0, score: 0, correctCount: 0, times: [], lastText: null, answered: true };
    $("score").textContent = "0";
    showScreen("game");
    nextQuestion();
  }

  function nextQuestion() {
    if (state.index >= ROUND_LENGTH) return endGame();

    const q = generateQuestion(state.lastText);
    const { options, correctIndex } = generateOptions(q.answer);
    state.question = q;
    state.lastText = q.text;
    state.correctIndex = correctIndex;
    state.answered = false;
    state.index++;

    $("progress").textContent = `${state.index}/${ROUND_LENGTH}`;
    $("question").textContent = q.text;
    const fb = $("feedback");
    fb.textContent = " ";
    fb.className = "feedback";
    $("answers").classList.remove("locked");
    answerButtons.forEach((btn, i) => {
      btn.textContent = options[i];
      btn.className = "answer";
    });

    // Timer startet, sobald die Aufgabe sichtbar ist
    state.startTime = performance.now();
    tickTimer();
  }

  /** Zeitbalken aktualisieren; bei Ablauf als "keine Antwort" werten. */
  function tickTimer() {
    const elapsed = performance.now() - state.startTime;
    const left = Math.max(0, 1 - elapsed / TIME_LIMIT_MS);
    $("timer-bar").style.transform = `scaleX(${left})`;
    if (elapsed >= TIME_LIMIT_MS) return handleAnswer(-1);
    rafId = requestAnimationFrame(tickTimer);
  }

  /** Antwort auswerten. index = -1 bedeutet: Zeit abgelaufen. */
  function handleAnswer(index) {
    if (!state || state.answered) return;
    state.answered = true;
    const elapsed = Math.min(performance.now() - state.startTime, TIME_LIMIT_MS);
    cancelAnimationFrame(rafId);

    const isCorrect = index === state.correctIndex;
    const points = calcPoints(isCorrect, elapsed);
    state.score += points;
    if (isCorrect) state.correctCount++;
    if (index !== -1) state.times.push(elapsed);

    $("score").textContent = state.score;
    $("answers").classList.add("locked");
    answerButtons[state.correctIndex].classList.add("correct");

    const fb = $("feedback");
    if (isCorrect) {
      fb.textContent = `Richtig! +${points}`;
      fb.className = "feedback good";
    } else {
      if (index !== -1) answerButtons[index].classList.add("wrong");
      fb.textContent = index === -1
        ? `Zeit abgelaufen – richtig: ${state.question.answer}`
        : `Falsch – richtig: ${state.question.answer}`;
      fb.className = "feedback bad";
    }

    nextTimeout = setTimeout(nextQuestion, FEEDBACK_MS);
  }

  function endGame() {
    const prev = getHighscore();
    const isRecord = state.score > prev;
    if (isRecord) setHighscore(state.score);

    const avg = state.times.length
      ? (state.times.reduce((s, t) => s + t, 0) / state.times.length / 1000).toFixed(1).replace(".", ",") + " s"
      : "–";

    $("end-score").textContent = state.score;
    $("end-correct").textContent = `${state.correctCount}/${ROUND_LENGTH}`;
    $("end-avg").textContent = avg;
    $("end-highscore").textContent = getHighscore();
    $("new-record").hidden = !isRecord;
    state = null;
    showScreen("end");
  }

  // Ereignisse
  $("btn-start").addEventListener("click", startGame);
  $("btn-again").addEventListener("click", startGame);
  answerButtons.forEach((btn, i) => btn.addEventListener("click", () => handleAnswer(i)));
  document.addEventListener("keydown", (e) => {
    if (e.key >= "1" && e.key <= "4" && screens.game.classList.contains("active")) {
      handleAnswer(Number(e.key) - 1);
    }
  });

  $("start-highscore").textContent = getHighscore();
}
