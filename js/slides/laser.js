import { dom } from './state.js';

let canvas = null;
let ctx = null;
let active = false;       // laser mode on/off
let drawing = false;      // pointer is down
let trail = [];           // array of {x, y, time}
let fadeAnimId = null;

const TRAIL_DURATION = 1500; // ms before trail points expire
const DOT_RADIUS = 8;
const TRAIL_WIDTH = 4;
const FADE_DURATION = 1000;  // ms for fade out after pointer up

function createCanvas() {
  canvas = document.createElement('canvas');
  canvas.id = 'laserCanvas';
  canvas.style.cssText = `
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    z-index: 500;
    pointer-events: none;
    display: none;
  `;
  dom.contentArea.appendChild(canvas);
  ctx = canvas.getContext('2d');
  resizeCanvas();
}

function resizeCanvas() {
  if (!canvas) return;
  canvas.width = dom.contentArea.clientWidth;
  canvas.height = dom.contentArea.clientHeight;
}

function getPos(e) {
  const rect = dom.contentArea.getBoundingClientRect();
  if (e.touches) {
    return {
      x: e.touches[0].clientX - rect.left,
      y: e.touches[0].clientY - rect.top
    };
  }
  return {
    x: e.clientX - rect.left,
    y: e.clientY - rect.top
  };
}

function onPointerDown(e) {
  if (!active) return;
  drawing = true;
  trail = [];
  if (fadeAnimId) {
    cancelAnimationFrame(fadeAnimId);
    fadeAnimId = null;
  }
  const pos = getPos(e);
  trail.push({ ...pos, time: Date.now() });
  drawTrail(1);
}

function onPointerMove(e) {
  if (!active || !drawing) return;
  const pos = getPos(e);
  trail.push({ ...pos, time: Date.now() });
  // Remove expired points
  const now = Date.now();
  trail = trail.filter(p => now - p.time < TRAIL_DURATION);
  drawTrail(1);
}

function onPointerUp() {
  if (!active || !drawing) return;
  drawing = false;
  startFadeOut();
}

function drawTrail(alpha) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (trail.length === 0) return;

  ctx.globalAlpha = alpha;

  // Draw trail line
  if (trail.length > 1) {
    ctx.beginPath();
    ctx.moveTo(trail[0].x, trail[0].y);
    for (let i = 1; i < trail.length; i++) {
      ctx.lineTo(trail[i].x, trail[i].y);
    }
    ctx.strokeStyle = 'rgba(255, 60, 60, 0.6)';
    ctx.lineWidth = TRAIL_WIDTH;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();
  }

  // Draw current dot (last point)
  const last = trail[trail.length - 1];
  ctx.beginPath();
  ctx.arc(last.x, last.y, DOT_RADIUS, 0, Math.PI * 2);
  ctx.fillStyle = '#ff3c3c';
  ctx.fill();

  // Outer glow
  ctx.beginPath();
  ctx.arc(last.x, last.y, DOT_RADIUS + 4, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255, 60, 60, 0.3)';
  ctx.fill();

  ctx.globalAlpha = 1;
}

function startFadeOut() {
  const startTime = Date.now();
  function fade() {
    const elapsed = Date.now() - startTime;
    const alpha = 1 - elapsed / FADE_DURATION;
    if (alpha <= 0) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      trail = [];
      fadeAnimId = null;
      return;
    }
    drawTrail(alpha);
    fadeAnimId = requestAnimationFrame(fade);
  }
  fadeAnimId = requestAnimationFrame(fade);
}

export function toggleLaser() {
  active = !active;
  if (active) {
    canvas.style.display = 'block';
    canvas.style.pointerEvents = 'auto';
    dom.contentArea.style.cursor = 'url("data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 width=%2724%27 height=%2724%27%3E%3Ccircle cx=%2712%27 cy=%2712%27 r=%278%27 fill=%27rgba(255,60,60,0.3)%27/%3E%3C/svg%3E") 12 12, auto';
    document.getElementById('laserBtn')?.classList.add('active');
  } else {
    canvas.style.display = 'none';
    canvas.style.pointerEvents = 'none';
    dom.contentArea.style.cursor = '';
    drawing = false;
    trail = [];
    if (fadeAnimId) {
      cancelAnimationFrame(fadeAnimId);
      fadeAnimId = null;
    }
    document.getElementById('laserBtn')?.classList.remove('active');
  }
}

export function isLaserActive() {
  return active;
}

export function initLaser() {
  createCanvas();

  // Mouse events
  canvas.addEventListener('mousedown', onPointerDown);
  canvas.addEventListener('mousemove', onPointerMove);
  canvas.addEventListener('mouseup', onPointerUp);
  canvas.addEventListener('mouseleave', onPointerUp);

  // Touch events
  canvas.addEventListener('touchstart', (e) => {
    e.preventDefault();
    onPointerDown(e);
  });
  canvas.addEventListener('touchmove', (e) => {
    e.preventDefault();
    onPointerMove(e);
  });
  canvas.addEventListener('touchend', onPointerUp);
  canvas.addEventListener('touchcancel', onPointerUp);

  // Resize
  window.addEventListener('resize', resizeCanvas);
}
