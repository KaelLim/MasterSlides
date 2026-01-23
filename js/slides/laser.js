import { dom } from './state.js';

let canvas = null;
let ctx = null;
let active = false;
let mouseX = -1;
let mouseY = -1;

const OVERLAY_ALPHA = 0.5;

function getSpotlightRadius() {
  return window.innerWidth * 0.1; // 20vw diameter = 10vw radius
}

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
  if (active && mouseX >= 0) drawSpotlight();
}

function getPos(e) {
  const rect = dom.contentArea.getBoundingClientRect();
  if (e.touches && e.touches.length > 0) {
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

function drawSpotlight() {
  const w = canvas.width;
  const h = canvas.height;
  const radius = getSpotlightRadius();

  ctx.clearRect(0, 0, w, h);

  // Draw dark overlay
  ctx.fillStyle = `rgba(0, 0, 0, ${OVERLAY_ALPHA})`;
  ctx.fillRect(0, 0, w, h);

  // Cut out spotlight circle with soft edge
  ctx.globalCompositeOperation = 'destination-out';
  const gradient = ctx.createRadialGradient(
    mouseX, mouseY, radius * 0.7,
    mouseX, mouseY, radius
  );
  gradient.addColorStop(0, 'rgba(0, 0, 0, 1)');
  gradient.addColorStop(0.8, 'rgba(0, 0, 0, 0.9)');
  gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');

  ctx.beginPath();
  ctx.arc(mouseX, mouseY, radius, 0, Math.PI * 2);
  ctx.fillStyle = gradient;
  ctx.fill();

  ctx.globalCompositeOperation = 'source-over';

  // Draw glowing border ring
  const glowGradient = ctx.createRadialGradient(
    mouseX, mouseY, radius * 0.75,
    mouseX, mouseY, radius * 1.05
  );
  glowGradient.addColorStop(0, 'rgba(255, 255, 255, 0)');
  glowGradient.addColorStop(0.4, 'rgba(200, 230, 255, 0.25)');
  glowGradient.addColorStop(0.7, 'rgba(150, 200, 255, 0.15)');
  glowGradient.addColorStop(1, 'rgba(100, 180, 255, 0)');

  ctx.beginPath();
  ctx.arc(mouseX, mouseY, radius * 1.05, 0, Math.PI * 2);
  ctx.fillStyle = glowGradient;
  ctx.fill();
}

function onMouseMove(e) {
  if (!active) return;
  const pos = getPos(e);
  mouseX = pos.x;
  mouseY = pos.y;
  drawSpotlight();
}

function onTouchMove(e) {
  if (!active) return;
  e.preventDefault();
  const pos = getPos(e);
  mouseX = pos.x;
  mouseY = pos.y;
  drawSpotlight();
}

export function toggleLaser() {
  active = !active;
  if (active) {
    canvas.style.display = 'block';
    canvas.style.pointerEvents = 'auto';
    canvas.style.cursor = 'none';
    document.getElementById('laserBtn')?.classList.add('active');
    // Draw initial state (full dark until mouse moves)
    if (mouseX < 0) {
      mouseX = canvas.width / 2;
      mouseY = canvas.height / 2;
    }
    drawSpotlight();
  } else {
    canvas.style.display = 'none';
    canvas.style.pointerEvents = 'none';
    canvas.style.cursor = '';
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    document.getElementById('laserBtn')?.classList.remove('active');
  }
}

export function isLaserActive() {
  return active;
}

export function initLaser() {
  createCanvas();

  canvas.addEventListener('mousemove', onMouseMove);
  canvas.addEventListener('touchmove', onTouchMove, { passive: false });
  canvas.addEventListener('touchstart', (e) => {
    if (!active) return;
    e.preventDefault();
    const pos = getPos(e);
    mouseX = pos.x;
    mouseY = pos.y;
    drawSpotlight();
  }, { passive: false });

  window.addEventListener('resize', resizeCanvas);
}
