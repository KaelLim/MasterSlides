import { dom, isMac } from './state.js';
import { goToPage, isVerticalMode } from './navigation.js';

let matches = [];
let currentIndex = -1;
let searchBar = null;
let searchInput = null;
let searchCount = null;
let debounceTimer = null;

function getPageForElement(el) {
  const containerWidth = dom.manuscriptContainer.clientWidth;
  const containerHeight = dom.manuscriptContainer.clientHeight;
  if (isVerticalMode()) {
    return Math.floor(el.offsetTop / containerHeight);
  } else {
    return Math.floor(el.offsetLeft / containerWidth);
  }
}

function clearHighlights() {
  const marks = dom.manuscript.querySelectorAll('mark.search-highlight');
  marks.forEach(mark => {
    const parent = mark.parentNode;
    parent.replaceChild(document.createTextNode(mark.textContent), mark);
    parent.normalize();
  });
  matches = [];
  currentIndex = -1;
}

function performSearch(query) {
  clearHighlights();
  if (!query || query.trim() === '') {
    updateCount();
    return;
  }

  const term = query.toLowerCase();
  const walker = document.createTreeWalker(
    dom.manuscript,
    NodeFilter.SHOW_TEXT,
    null
  );

  const textNodes = [];
  let node;
  while ((node = walker.nextNode())) {
    if (node.textContent.toLowerCase().includes(term)) {
      textNodes.push(node);
    }
  }

  textNodes.forEach(textNode => {
    const text = textNode.textContent;
    const lowerText = text.toLowerCase();
    const fragment = document.createDocumentFragment();
    let lastIndex = 0;
    let matchIndex = lowerText.indexOf(term, lastIndex);

    while (matchIndex !== -1) {
      // Text before match
      if (matchIndex > lastIndex) {
        fragment.appendChild(document.createTextNode(text.substring(lastIndex, matchIndex)));
      }
      // The match
      const mark = document.createElement('mark');
      mark.className = 'search-highlight';
      mark.textContent = text.substring(matchIndex, matchIndex + term.length);
      fragment.appendChild(mark);

      lastIndex = matchIndex + term.length;
      matchIndex = lowerText.indexOf(term, lastIndex);
    }

    // Remaining text after last match
    if (lastIndex < text.length) {
      fragment.appendChild(document.createTextNode(text.substring(lastIndex)));
    }

    textNode.parentNode.replaceChild(fragment, textNode);
  });

  matches = Array.from(dom.manuscript.querySelectorAll('mark.search-highlight'));
  if (matches.length > 0) {
    goToMatch(0);
  }
  updateCount();
}

function goToMatch(index) {
  if (matches.length === 0) return;

  // Remove current highlight
  if (currentIndex >= 0 && currentIndex < matches.length) {
    matches[currentIndex].classList.remove('current');
  }

  currentIndex = index;
  const mark = matches[currentIndex];
  mark.classList.add('current');

  // Navigate to the page containing this match
  const page = getPageForElement(mark);
  goToPage(page);

  updateCount();
}

function updateCount() {
  if (matches.length === 0) {
    searchCount.textContent = searchInput.value ? '無結果' : '';
  } else {
    searchCount.textContent = `${currentIndex + 1}/${matches.length}`;
  }
}

export function nextMatch() {
  if (matches.length === 0) return;
  goToMatch((currentIndex + 1) % matches.length);
}

export function prevMatch() {
  if (matches.length === 0) return;
  goToMatch((currentIndex - 1 + matches.length) % matches.length);
}

export function openSearch() {
  searchBar.classList.add('active');
  searchInput.focus();
  searchInput.select();
}

export function closeSearch() {
  searchBar.classList.remove('active');
  searchInput.value = '';
  clearHighlights();
  updateCount();
}

export function isSearchOpen() {
  return searchBar && searchBar.classList.contains('active');
}

export function initSearch() {
  searchBar = document.getElementById('searchBar');
  searchInput = document.getElementById('searchInput');
  searchCount = document.getElementById('searchCount');

  // Input with debounce
  searchInput.addEventListener('input', () => {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      performSearch(searchInput.value);
    }, 200);
  });

  // Keyboard in search input
  searchInput.addEventListener('keydown', (e) => {
    e.stopPropagation();
    const hasModKey = isMac ? e.metaKey : e.ctrlKey;
    if (hasModKey && e.key === 'f') {
      e.preventDefault(); // Prevent browser native search
      searchInput.select();
    } else if (e.key === 'Enter') {
      if (e.shiftKey) {
        prevMatch();
      } else {
        nextMatch();
      }
    } else if (e.key === 'Escape') {
      closeSearch();
    }
  });

  // Buttons
  document.getElementById('searchNext').onclick = nextMatch;
  document.getElementById('searchPrev').onclick = prevMatch;
  document.getElementById('searchClose').onclick = closeSearch;
}
