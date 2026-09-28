const sprite = document.querySelector('#sprite');
const bubble = document.querySelector('#bubble');
const menu = document.querySelector('#menu');
const empty = document.querySelector('#empty');
const petSelect = document.querySelector('#pet-select');
const scaleInput = document.querySelector('#scale');
const wanderInput = document.querySelector('#wander');

const ANIMATIONS = {
  idle: { row: 0, frames: 7, ms: 180 },
  'running-right': { row: 1, frames: 8, ms: 95 },
  'running-left': { row: 2, frames: 8, ms: 95 },
  waving: { row: 3, frames: 4, ms: 150 },
  jumping: { row: 4, frames: 5, ms: 110 },
  failed: { row: 5, frames: 8, ms: 150 },
  waiting: { row: 6, frames: 6, ms: 180 },
  running: { row: 7, frames: 6, ms: 105 },
  review: { row: 8, frames: 6, ms: 160 }
};

let pet = null;
let pets = [];
let state = 'idle';
let frame = 0;
let animationTimer;
let transientTimer;
let bubbleTimer;
let motionExpires = 0;
let pointerStart = null;
let dragged = false;
let suppressClick = false;

function showBubble(text, duration = 2200) {
  bubble.textContent = text;
  bubble.classList.add('visible');
  clearTimeout(bubbleTimer);
  bubbleTimer = setTimeout(() => bubble.classList.remove('visible'), duration);
}

function applyFrame(row, column) {
  sprite.style.backgroundPosition = `${column * (100 / 7)}% ${row * 10}%`;
}

function animate(nextState = state) {
  state = ANIMATIONS[nextState] ? nextState : 'idle';
  frame = 0;
  clearInterval(animationTimer);
  const animation = ANIMATIONS[state];
  applyFrame(animation.row, 0);
  animationTimer = setInterval(() => {
    frame = (frame + 1) % animation.frames;
    applyFrame(animation.row, frame);
  }, animation.ms);
}

function transient(nextState, duration = 1000) {
  clearTimeout(transientTimer);
  animate(nextState);
  transientTimer = setTimeout(() => animate('idle'), duration);
}

function setPet(nextPet) {
  pet = nextPet;
  empty.hidden = Boolean(pet);
  sprite.hidden = !pet;
  if (!pet) return;
  sprite.style.backgroundImage = `url("${pet.spriteUrl}")`;
  sprite.setAttribute('aria-label', pet.displayName);
  animate(state);
  showBubble(pet.displayName);
}

function renderPetOptions() {
  petSelect.replaceChildren(...pets.map((item) => {
    const option = document.createElement('option');
    option.value = item.id;
    option.textContent = item.displayName;
    option.selected = pet?.id === item.id;
    return option;
  }));
}

function setMenuOpen(open) {
  menu.hidden = !open;
  if (open) renderPetOptions();
  window.orcaPet.setMenuOpen(open);
}

function applyScale(scale) {
  const normalized = Math.min(2.5, Math.max(0.5, Number(scale) || 1));
  document.documentElement.style.setProperty('--pet-width', `${192 * 0.6 * normalized}px`);
  document.documentElement.style.setProperty('--pet-height', `${208 * 0.6 * normalized}px`);
}

function handleStatus(status) {
  if (Date.now() < motionExpires && status.state === 'idle') return;
  animate(status.state);
  const labels = { idle: 'ひと休み', running: '作業中', waiting: '入力待ち', review: 'レビュー中', failed: '失敗' };
  showBubble(`${labels[status.state] || status.state} · ${status.detail}`, 1800);
}

sprite.addEventListener('mouseenter', () => {
  if (!pointerStart) transient('waving', 900);
});
sprite.addEventListener('pointerdown', (event) => {
  if (event.button !== 0) return;
  pointerStart = { x: event.screenX, y: event.screenY };
  dragged = false;
  sprite.setPointerCapture(event.pointerId);
  window.orcaPet.beginDrag(pointerStart);
});
sprite.addEventListener('pointermove', (event) => {
  if (!pointerStart) return;
  if (Math.hypot(event.screenX - pointerStart.x, event.screenY - pointerStart.y) >= 4) dragged = true;
  if (dragged) window.orcaPet.moveDrag({ x: event.screenX, y: event.screenY });
});
function finishPointer(event) {
  if (!pointerStart) return;
  if (sprite.hasPointerCapture(event.pointerId)) sprite.releasePointerCapture(event.pointerId);
  window.orcaPet.endDrag();
  suppressClick = dragged;
  pointerStart = null;
  setTimeout(() => { suppressClick = false; }, 0);
}
sprite.addEventListener('pointerup', finishPointer);
sprite.addEventListener('pointercancel', finishPointer);
sprite.addEventListener('click', () => {
  if (!suppressClick) window.orcaPet.stopMotion();
});
sprite.addEventListener('dblclick', () => transient('jumping', 750));
document.addEventListener('contextmenu', (event) => {
  event.preventDefault();
  setMenuOpen(menu.hidden);
});
document.addEventListener('click', (event) => {
  if (!menu.hidden && !menu.contains(event.target)) setMenuOpen(false);
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !menu.hidden) setMenuOpen(false);
});
document.querySelector('#close-menu').addEventListener('click', () => setMenuOpen(false));
empty.addEventListener('click', async () => setPet(await window.orcaPet.choosePet()));
document.querySelector('#browse').addEventListener('click', async () => {
  const selected = await window.orcaPet.choosePet();
  if (selected) {
    if (!pets.some((item) => item.id === selected.id)) pets.unshift(selected);
    setPet(selected);
    renderPetOptions();
  }
});
document.querySelector('#new-project').addEventListener('click', () => window.orcaPet.launchProjectPet());
document.querySelector('#install-pet').addEventListener('click', async () => {
  const result = await window.orcaPet.installPet();
  if (!result) return;
  pets = result.pets;
  setPet(result.pet);
  renderPetOptions();
});
petSelect.addEventListener('change', async () => setPet(await window.orcaPet.selectPet(petSelect.value)));
scaleInput.addEventListener('input', () => applyScale(scaleInput.value));
scaleInput.addEventListener('change', async () => applyScale(await window.orcaPet.setScale(scaleInput.value)));
wanderInput.addEventListener('change', () => window.orcaPet.setWander(wanderInput.checked));
document.querySelector('#quit').addEventListener('click', () => window.orcaPet.quit());

window.orcaPet.onStatus(handleStatus);
window.orcaPet.onPet(setPet);
window.orcaPet.onMotion((motion) => {
  if (!motion.moving) {
    animate('idle');
    return;
  }
  motionExpires = Date.now() + 180;
  const motionState = motion.direction === 'right' ? 'running-right' : 'running-left';
  if (state !== motionState) animate(motionState);
});

window.orcaPet.getInitialState().then((initial) => {
  pets = initial.pets;
  scaleInput.value = initial.settings.scale;
  applyScale(initial.settings.scale);
  wanderInput.checked = initial.settings.wander;
  setPet(initial.pet);
  renderPetOptions();
  handleStatus(initial.status);
});
