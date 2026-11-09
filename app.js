"use strict";

/* ---------- Small helpers ---------- */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

/* Demo storage. localStorage is NOT secure. Passwords are never saved. */
function load(key, fallback) {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; }
  catch (e) { return fallback; }
}
function save(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* ignore */ }
}
const getUser = () => load("rd_user", null);

/* ---------- Navigation ---------- */
const PUBLIC = ["home", "about", "what", "news", "login", "register", "privacy"];
let current = "";

function renderAuth() {
  const u = getUser();
  $("#authNav").innerHTML = u
    ? `<a href="#dashboard">Dashboard</a><span class="who">${esc(u.username)}</span><a href="#" id="logout">Log out</a>`
    : `<a href="#login">Log in</a><a class="btn primary" href="#register">Sign up</a>`;
  const out = $("#logout");
  if (out) out.addEventListener("click", e => {
    e.preventDefault();
    save("rd_user", null);
    location.hash = "#home";
    renderAuth();
  });
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function route() {
  let name = location.hash.slice(1) || "home";
  if (name === "how") name = "home"; // "How it works" is part of the home page
  if (!$(`[data-page="${name}"]`)) name = "home";
  if (!PUBLIC.includes(name) && !getUser()) name = "login";

  if (current === "drive" && name !== "drive") endSession();
  current = name;

  $$("[data-page]").forEach(p => p.classList.toggle("show", p.dataset.page === name));
  $$(".links a").forEach(a => a.classList.toggle("on", a.getAttribute("href") === "#" + name));

  const u = getUser();
  if (name === "dashboard" && u) $("#welcome").textContent = "Welcome, " + u.username;
  if (name === "drive") startSession();

  renderAuth();
  if (location.hash !== "#how") window.scrollTo(0, 0);
}
window.addEventListener("hashchange", route);

/* ---------- Register and login (demo) ---------- */
$("#regForm").addEventListener("submit", e => {
  e.preventDefault();
  const f = e.target, err = $("#regError");
  const username = f.user.value.trim(), email = f.email.value.trim();
  if (username.length < 3) return (err.textContent = "Username must have at least 3 characters.");
  if (!/^\S+@\S+\.\S+$/.test(email)) return (err.textContent = "Enter a valid email address.");
  if (f.pw.value.length < 6) return (err.textContent = "Password must have at least 6 characters.");
  const accounts = load("rd_accounts", []);
  const taken = accounts.some(a => a.username.toLowerCase() === username.toLowerCase() || a.email.toLowerCase() === email.toLowerCase());
  if (taken) return (err.textContent = "That username or email is already used. Log in instead.");
  accounts.push({ username, email });   // password is NOT stored
  save("rd_accounts", accounts);
  save("rd_user", { username });
  err.textContent = "";
  f.reset();
  location.hash = "#dashboard";
});

$("#loginForm").addEventListener("submit", e => {
  e.preventDefault();
  const f = e.target, err = $("#loginError");
  const id = f.uid.value.trim().toLowerCase();
  if (!id || !f.pw.value) return (err.textContent = "Enter your username or email and a password.");
  const acc = load("rd_accounts", []).find(a => a.username.toLowerCase() === id || a.email.toLowerCase() === id);
  if (!acc) return (err.textContent = "No demo account found. Create an account first.");
  save("rd_user", { username: acc.username });
  err.textContent = "";
  f.reset();
  location.hash = "#dashboard";
});

/* ---------- Simulated driving (no hardware) ---------- */
const SESSION_SECONDS = 300;
const keys = { f: false, b: false, l: false, r: false };
const rover = { x: 320, y: 200, a: -Math.PI / 2, v: 0 };
let left = 0, tick = null, raf = null, stopped = false, active = false;

const cam = $("#cam"), ctx = cam.getContext("2d");
const estop = $("#estop"), restart = $("#restart");

function fmt(s) { return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0"); }

function startSession() {
  endSession();
  left = SESSION_SECONDS; stopped = false; active = true;
  Object.assign(rover, { x: 320, y: 200, a: -Math.PI / 2, v: 0 });
  setStop(false);
  restart.hidden = true;
  $("#timer").textContent = fmt(left);
  $("#queue").textContent = "You are driving. 0 people waiting.";
  $$(".k").forEach(b => (b.disabled = false));
  tick = setInterval(() => {
    left--; $("#timer").textContent = fmt(Math.max(left, 0));
    if (left <= 0) timeUp();
  }, 1000);
  raf = requestAnimationFrame(loop);
}

function endSession() {
  clearInterval(tick); cancelAnimationFrame(raf);
  tick = raf = null; active = false;
  Object.keys(keys).forEach(k => (keys[k] = false));
  $$(".k").forEach(b => b.classList.remove("active"));
}

function timeUp() {
  endSession();
  $("#queue").textContent = "Session ended. Start a new session to drive again.";
  $$(".k").forEach(b => (b.disabled = true));
  restart.hidden = false;
  draw();
}

restart.addEventListener("click", startSession);

function setStop(on) {
  stopped = on;
  estop.classList.toggle("on", on);
  estop.textContent = on ? "Release stop" : "Emergency stop";
  if (on) { Object.keys(keys).forEach(k => (keys[k] = false)); $$(".k").forEach(b => b.classList.remove("active")); rover.v = 0; }
}
estop.addEventListener("click", () => active && setStop(!stopped));

/* On-screen buttons (mouse and touch) */
$$(".k").forEach(btn => {
  const k = btn.dataset.k;
  const down = e => { e.preventDefault(); if (!active || stopped) return; keys[k] = true; btn.classList.add("active"); };
  const up = () => { keys[k] = false; btn.classList.remove("active"); };
  btn.addEventListener("pointerdown", down);
  ["pointerup", "pointerleave", "pointercancel"].forEach(ev => btn.addEventListener(ev, up));
});

/* Keyboard */
const KEYMAP = { ArrowUp: "f", w: "f", W: "f", ArrowDown: "b", s: "b", S: "b", ArrowLeft: "l", a: "l", A: "l", ArrowRight: "r", d: "r", D: "r" };
window.addEventListener("keydown", e => {
  if (current !== "drive" || !active || e.target.tagName === "INPUT") return;
  if (e.key === " " && e.target.tagName !== "BUTTON") { e.preventDefault(); setStop(!stopped); return; }
  const k = KEYMAP[e.key];
  if (k && !stopped) { e.preventDefault(); keys[k] = true; $(`.k[data-k="${k}"]`).classList.add("active"); }
});
window.addEventListener("keyup", e => {
  const k = KEYMAP[e.key];
  if (k) { keys[k] = false; $(`.k[data-k="${k}"]`).classList.remove("active"); }
});

/* Simulation loop and drawing */
function loop() {
  if (!active) return;
  if (!stopped) {
    if (keys.l) rover.a -= 0.04;
    if (keys.r) rover.a += 0.04;
    const target = keys.f ? 2.4 : keys.b ? -1.6 : 0;
    rover.v += (target - rover.v) * 0.12;
    rover.x = Math.min(600, Math.max(40, rover.x + Math.cos(rover.a) * rover.v));
    rover.y = Math.min(360, Math.max(40, rover.y + Math.sin(rover.a) * rover.v));
  }
  draw();
  raf = requestAnimationFrame(loop);
}

function draw() {
  const w = cam.width, h = cam.height;
  ctx.fillStyle = "#0a100c"; ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = "#1c2a21"; ctx.lineWidth = 1;
  for (let x = 0; x <= w; x += 40) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
  for (let y = 0; y <= h; y += 40) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
  ctx.strokeStyle = "#3ddc84"; ctx.lineWidth = 3; ctx.strokeRect(20, 20, w - 40, h - 40);

  ctx.save();
  ctx.translate(rover.x, rover.y); ctx.rotate(rover.a);
  ctx.fillStyle = "#1d2b22"; ctx.strokeStyle = "#3ddc84"; ctx.lineWidth = 2;
  ctx.fillRect(-24, -14, 48, 28); ctx.strokeRect(-24, -14, 48, 28);
  ctx.fillStyle = "#3ddc84"; ctx.fillRect(14, -5, 10, 10);
  ctx.restore();

  ctx.fillStyle = "#8fa396"; ctx.font = "14px sans-serif";
  ctx.fillText("Speed " + Math.abs(rover.v).toFixed(1) + (stopped ? "   STOPPED" : ""), 32, h - 30);
}

/* ---------- Start ---------- */
draw();
route();
