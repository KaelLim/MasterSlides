import { dom } from './state.js';

let canvas = null;
let ctx = null;
let blurOverlay = null;
let active = false;
let mouseX = -1;
let mouseY = -1;

// Darker than the previous 0.5: a stronger dark band outside the spotlight
// is what makes the lit area "pop". Combined with the blur overlay below
// it gives the eye an unambiguous focal target.
const OVERLAY_ALPHA = 0.75;
// Strength of the soft-focus blur on the non-spotlight area. 3px is enough
// to mute body text into a haze while keeping rough layout legible.
const BLUR_PX = 3;

function getSpotlightRadius() {
  return window.innerWidth * 0.1; // 20vw diameter = 10vw radius
}

function createCanvas() {
  // Blur layer sits underneath the dark canvas so the outer ring gets
  // both blurred (by this overlay) and darkened (by the canvas above).
  // The spotlight area is masked transparent here AND cut out of the
  // canvas — so the centre stays sharp and bright.
  blurOverlay = document.createElement('div');
  blurOverlay.id = 'spotlightBlur';
  blurOverlay.style.cssText = `
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    z-index: var(--z-spotlight-blur);
    pointer-events: none;
    display: none;
    backdrop-filter: blur(${BLUR_PX}px);
    -webkit-backdrop-filter: blur(${BLUR_PX}px);
  `;
  dom.contentArea.appendChild(blurOverlay);

  canvas = document.createElement('canvas');
  canvas.id = 'laserCanvas';
  canvas.style.cssText = `
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    z-index: var(--z-spotlight);
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

// Mask the blur layer so its backdrop-filter only applies outside the
// spotlight. Inside the circle the mask is transparent → the element
// isn't rendered → no blur there → content reads sharp.
function applyBlurMask() {
  if (!blurOverlay) return;
  const r = getSpotlightRadius();
  const gradient = `radial-gradient(circle at ${mouseX}px ${mouseY}px, transparent 0px, transparent ${r * 0.95}px, black ${r * 1.05}px)`;
  blurOverlay.style.mask = gradient;
  blurOverlay.style.webkitMask = gradient;
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

  // Dark overlay over the whole content area.
  ctx.fillStyle = `rgba(0, 0, 0, ${OVERLAY_ALPHA})`;
  ctx.fillRect(0, 0, w, h);

  // Cut a circle out of that overlay. Sharper edge than before — the inner
  // 92% of the radius is fully transparent (clean cut), only the outer 8%
  // fades to maintain a soft halo seam against the dark surround.
  ctx.globalCompositeOperation = 'destination-out';
  const gradient = ctx.createRadialGradient(
    mouseX, mouseY, radius * 0.85,
    mouseX, mouseY, radius
  );
  gradient.addColorStop(0, 'rgba(0, 0, 0, 1)');
  gradient.addColorStop(0.6, 'rgba(0, 0, 0, 0.95)');
  gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');

  ctx.beginPath();
  ctx.arc(mouseX, mouseY, radius, 0, Math.PI * 2);
  ctx.fillStyle = gradient;
  ctx.fill();

  ctx.globalCompositeOperation = 'source-over';

  // Warm halo straddling the cutout edge. Brighter alphas than before to
  // give the boundary a stage-light glow that pops against the darker
  // OVERLAY_ALPHA outside.
  const glowGradient = ctx.createRadialGradient(
    mouseX, mouseY, radius * 0.65,
    mouseX, mouseY, radius * 1.2
  );
  glowGradient.addColorStop(0,   'rgba(255, 255, 255, 0)');
  glowGradient.addColorStop(0.3, 'rgba(255, 250, 240, 0.20)');
  glowGradient.addColorStop(0.5, 'rgba(255, 230, 180, 0.28)');
  glowGradient.addColorStop(0.7, 'rgba(255, 200, 120, 0.16)');
  glowGradient.addColorStop(0.9, 'rgba(255, 180, 80, 0.06)');
  glowGradient.addColorStop(1,   'rgba(255, 160, 60, 0)');

  ctx.beginPath();
  ctx.arc(mouseX, mouseY, radius * 1.2, 0, Math.PI * 2);
  ctx.fillStyle = glowGradient;
  ctx.fill();

  applyBlurMask();
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
    blurOverlay.style.display = 'block';
    const laserBtn = document.getElementById('laserBtn');
    laserBtn?.classList.add('active');
    laserBtn?.setAttribute('aria-pressed', 'true');
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
    blurOverlay.style.display = 'none';
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const laserBtn = document.getElementById('laserBtn');
    laserBtn?.classList.remove('active');
    laserBtn?.setAttribute('aria-pressed', 'false');
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
