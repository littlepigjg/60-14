const UI = {
  toastContainer: null,

  ensureToastContainer() {
    if (!this.toastContainer) {
      this.toastContainer = document.createElement('div');
      this.toastContainer.className = 'toast-container';
      document.body.appendChild(this.toastContainer);
    }
    return this.toastContainer;
  },

  toast(message, duration = 2500) {
    const container = this.ensureToastContainer();
    const el = document.createElement('div');
    el.className = 'toast';
    el.textContent = message;
    container.appendChild(el);
    setTimeout(() => {
      el.style.animation = 'toastOut 0.25s ease-in forwards';
      setTimeout(() => el.remove(), 300);
    }, duration);
  },

  copyText(text) {
    return navigator.clipboard.writeText(text).then(
      () => {
        this.toast('已复制: ' + text);
        return true;
      },
      () => {
        this.toast('复制失败，请手动复制');
        return false;
      }
    );
  },

  renderParticipantList(container, clients, myId) {
    const sorted = [...clients].sort((a, b) => {
      if (a.id === myId) return -1;
      if (b.id === myId) return 1;
      if (a.role === 'host') return -1;
      if (b.role === 'host') return 1;
      return 0;
    });

    container.innerHTML = sorted.map((c) => {
      const isMe = c.id === myId;
      return `
        <li class="participant-item" data-id="${c.id}">
          <div class="participant-info">
            <div class="participant-avatar" style="background:${Utils.getColorFromId(c.id)}">
              ${Utils.initials(c.name)}
            </div>
            <span class="participant-name" title="${c.name}">${c.name}</span>
          </div>
          <div class="participant-badges">
            ${isMe ? '<span class="mini-badge me">我</span>' : ''}
            ${c.role === 'host' ? '<span class="mini-badge host">主持</span>' : ''}
            ${c.audioEnabled
              ? '<span class="mini-badge audio">🎙</span>'
              : '<span class="mini-badge audio off">🔇</span>'}
          </div>
        </li>
      `;
    }).join('');
  }
};

window.UI = UI;
