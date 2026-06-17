if (document.body.classList.contains('landing-body')) {
  const errorEl = document.getElementById('errorMsg');

  const createBtn = document.getElementById('createRoomBtn');
  const joinBtn = document.getElementById('joinRoomBtn');
  const roomCodeInput = document.getElementById('roomCodeInput');
  const hostNameInput = document.getElementById('hostName');
  const joinNameInput = document.getElementById('joinName');

  createBtn.addEventListener('click', async () => {
    errorEl.textContent = '';
    const name = hostNameInput.value.trim();
    try {
      await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: 30 },
        audio: false
      });
      sessionStorage.setItem('userName', name || '');
      sessionStorage.setItem('mode', 'host');
      window.location.href = '/room.html';
    } catch (err) {
      errorEl.textContent = '需要授权屏幕捕获才能创建房间';
    }
  });

  joinBtn.addEventListener('click', () => {
    errorEl.textContent = '';
    const name = joinNameInput.value.trim();
    const code = roomCodeInput.value.trim();
    if (!/^\d{6}$/.test(code)) {
      errorEl.textContent = '请输入6位数字房间码';
      return;
    }
    sessionStorage.setItem('userName', name || '');
    sessionStorage.setItem('mode', 'viewer');
    sessionStorage.setItem('roomCode', code);
    window.location.href = '/room.html';
  });

  roomCodeInput.addEventListener('input', (e) => {
    e.target.value = e.target.value.replace(/\D/g, '').slice(0, 6);
  });
}
