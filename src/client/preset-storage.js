/**
 * Preset persistence & sharing.
 *
 * - localStorage: saves/loads full params as JSON (exact values, no quantization)
 * - URL hash: binary-encoded preset string (compact, for sharing)
 * - Share FAB: generates a share URL and shows it in a copy-modal
 * - Toast: brief notification messages
 */

import { params, DEFAULT_PARAMS } from './params.js';
import { encodePreset, decodePreset, applyPreset } from './preset-codec.js';

const STORAGE_KEY = 'windchime-params';

// ---------------------------------------------------------------------------
// Toast notifications
// ---------------------------------------------------------------------------

let toastEl = null;
let toastTimer = null;

function ensureToast() {
  if (toastEl) return toastEl;
  toastEl = document.createElement('div');
  toastEl.id = 'preset-toast';
  document.body.appendChild(toastEl);
  return toastEl;
}

export function showToast(message, duration = 2500) {
  const el = ensureToast();
  el.textContent = message;
  el.classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('visible'), duration);
}

// ---------------------------------------------------------------------------
// Share modal
// ---------------------------------------------------------------------------

let modalEl = null;

function ensureModal() {
  if (modalEl) return modalEl;

  modalEl = document.createElement('div');
  modalEl.id = 'share-modal';
  modalEl.innerHTML = `
    <div class="share-backdrop"></div>
    <div class="share-card">
      <div class="share-title">Share Preset</div>
      <input class="share-url" readonly />
      <button class="share-copy">Copy</button>
    </div>
  `;
  document.body.appendChild(modalEl);

  const backdrop = modalEl.querySelector('.share-backdrop');
  const input = modalEl.querySelector('.share-url');
  const copyBtn = modalEl.querySelector('.share-copy');

  backdrop.addEventListener('click', () => closeModal());
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modalEl.classList.contains('visible')) closeModal();
  });

  copyBtn.addEventListener('click', () => {
    navigator.clipboard.writeText(input.value).then(() => {
      copyBtn.textContent = 'Copied!';
      setTimeout(() => { copyBtn.textContent = 'Copy'; }, 1500);
    });
  });

  return modalEl;
}

function openModal(url) {
  const modal = ensureModal();
  const input = modal.querySelector('.share-url');
  input.value = url;
  modal.classList.add('visible');
  // Select text for easy manual copy
  requestAnimationFrame(() => { input.select(); });
}

function closeModal() {
  if (modalEl) modalEl.classList.remove('visible');
}

// ---------------------------------------------------------------------------
// Share FAB
// ---------------------------------------------------------------------------

function createShareFAB() {
  const btn = document.createElement('button');
  btn.id = 'share-fab';
  btn.setAttribute('aria-label', 'Share preset');
  btn.innerHTML = `<svg viewBox="0 0 24 24"><path d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92s2.92-1.31 2.92-2.92-1.31-2.92-2.92-2.92z"/></svg>`;

  btn.addEventListener('click', () => {
    const encoded = encodePreset(params);
    const url = window.location.origin + window.location.pathname + '#' + encoded;
    openModal(url);
  });

  document.body.appendChild(btn);
}

// ---------------------------------------------------------------------------
// Reset FAB
// ---------------------------------------------------------------------------

function createResetFAB(onReset) {
  const btn = document.createElement('button');
  btn.id = 'reset-fab';
  btn.setAttribute('aria-label', 'Reset to defaults');
  // Refresh/recycle icon
  btn.innerHTML = `<svg viewBox="0 0 24 24"><path d="M17.65 6.35A7.96 7.96 0 0012 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08A5.99 5.99 0 0112 18c-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/></svg>`;

  btn.addEventListener('click', () => {
    applyJSON(DEFAULT_PARAMS);
    localStorage.removeItem(STORAGE_KEY);
    showToast('Reset to defaults');
    onReset();
  });

  document.body.appendChild(btn);
}

// ---------------------------------------------------------------------------
// localStorage persistence (JSON, exact values)
// ---------------------------------------------------------------------------

let saveTimer = null;

function saveToStorage() {
  // Shallow-clone scalars, deep-clone arrays/objects
  const snapshot = {};
  for (const key of Object.keys(params)) {
    const v = params[key];
    if (Array.isArray(v)) {
      // skyGradients is an array of arrays of objects; chimeSemitones is flat
      snapshot[key] = JSON.parse(JSON.stringify(v));
    } else {
      snapshot[key] = v;
    }
  }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
  } catch { /* quota exceeded — ignore silently */ }
}

/** Debounced save — call on every param change. */
export function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveToStorage, 800);
}

function loadFromStorage() {
  try {
    const json = localStorage.getItem(STORAGE_KEY);
    if (!json) return null;
    return JSON.parse(json);
  } catch {
    return null;
  }
}

function applyJSON(saved) {
  for (const key of Object.keys(saved)) {
    if (!(key in params)) continue;

    if (key === 'skyGradients') {
      for (let i = 0; i < saved.skyGradients.length && i < params.skyGradients.length; i++) {
        for (let j = 0; j < saved.skyGradients[i].length && j < params.skyGradients[i].length; j++) {
          if (saved.skyGradients[i][j].color !== undefined) {
            params.skyGradients[i][j].color = saved.skyGradients[i][j].color;
          }
          if (saved.skyGradients[i][j].offset !== undefined) {
            params.skyGradients[i][j].offset = saved.skyGradients[i][j].offset;
          }
        }
      }
    } else if (key === 'chimeSemitones') {
      params.chimeSemitones.length = 0;
      saved.chimeSemitones.forEach(v => params.chimeSemitones.push(v));
    } else {
      params[key] = saved[key];
    }
  }
}

// ---------------------------------------------------------------------------
// Initialization
// ---------------------------------------------------------------------------

/**
 * @param {Object} callbacks
 * @param {Function} callbacks.onLoad — called after a preset is applied
 *   (should trigger rebuild, audio update, GUI refresh)
 */
export function initPresets({ onLoad }) {
  // 1. Check URL hash for a shared preset
  const hash = window.location.hash.slice(1);
  if (hash) {
    const result = decodePreset(hash);
    if (result.values) {
      applyPreset(result.values, params);
      // Clear hash so it doesn't persist in bookmarks/history
      history.replaceState(null, '', window.location.pathname + window.location.search);
      saveToStorage();
      showToast('Preset loaded from URL');
      onLoad();
    } else {
      showToast('Invalid preset link: ' + result.error);
      // Fall through to try localStorage
      const saved = loadFromStorage();
      if (saved) {
        applyJSON(saved);
        onLoad();
      }
    }
  } else {
    // 2. Try localStorage
    const saved = loadFromStorage();
    if (saved) {
      applyJSON(saved);
      onLoad();
    }
  }

  // 3. Create FABs
  createShareFAB();
  createResetFAB(onLoad);
}
