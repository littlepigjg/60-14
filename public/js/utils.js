const Utils = {
  $(selector, root = document) {
    return root.querySelector(selector);
  },

  $$(selector, root = document) {
    return [...root.querySelectorAll(selector)];
  },

  getColorFromId(id) {
    const colors = [
      '#ef4444', '#f59e0b', '#10b981', '#3b82f6',
      '#8b5cf6', '#ec4899', '#14b8a6', '#f97316'
    ];
    let hash = 0;
    for (let i = 0; i < id.length; i++) {
      hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
    }
    return colors[hash % colors.length];
  },

  initials(name) {
    const n = (name || '?').trim();
    if (!n) return '?';
    return n.slice(0, 2).toUpperCase();
  },

  generateId() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      return crypto.randomUUID();
    }
    return 'id_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
  },

  debounce(fn, delay) {
    let timer = null;
    return function (...args) {
      clearTimeout(timer);
      timer = setTimeout(() => fn.apply(this, args), delay);
    };
  },

  formatTime(ts) {
    const d = new Date(ts);
    const pad = (n) => n.toString().padStart(2, '0');
    return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  }
};

window.Utils = Utils;
