import { initDOM } from './state.js';
import { init } from './loader.js';

document.addEventListener('DOMContentLoaded', () => {
  initDOM();
  init();
});
