(function() {
  // Badge 樣式
  const styles = {
    alpha: { bg: '#e74c3c', text: 'Alpha' },
    beta: { bg: '#f39c12', text: 'Beta' },
    rc: { bg: '#3498db', text: 'RC' },
    stable: { bg: '#27ae60', text: 'Stable' }
  };

  // 取得設定並顯示 Badge
  fetch('/config.json')
    .then(res => res.json())
    .then(config => {
      if (!config.showBadge || config.stage === 'stable') return;

      const style = styles[config.stage] || styles.beta;

      const badge = document.createElement('div');
      badge.id = 'app-version-badge';
      badge.innerHTML = `${style.text} <span style="opacity:0.8">v${config.version}</span>`;
      badge.style.cssText = `
        position: fixed;
        top: 16px;
        right: 16px;
        background: ${style.bg};
        color: white;
        padding: 6px 14px;
        border-radius: 20px;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        font-size: 13px;
        font-weight: 600;
        z-index: 99999;
        box-shadow: 0 2px 8px rgba(0,0,0,0.3);
        pointer-events: none;
        user-select: none;
      `;

      document.body.appendChild(badge);
    })
    .catch(() => {});
})();
