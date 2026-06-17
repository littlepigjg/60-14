class SignalingClient {
  constructor() {
    this.ws = null;
    this.clientId = null;
    this.roomCode = null;
    this.role = null;
    this.handlers = new Map();
  }

  connect() {
    return new Promise((resolve, reject) => {
      const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
      const url = `${proto}//${location.host}`;
      this.ws = new WebSocket(url);

      const timeout = setTimeout(() => reject(new Error('连接超时')), 5000);

      this.ws.addEventListener('open', () => {
        clearTimeout(timeout);
      });

      this.ws.addEventListener('message', (e) => {
        let msg;
        try { msg = JSON.parse(e.data); } catch { return; }
        if (msg.type === 'connected') {
          this.clientId = msg.clientId;
          resolve();
        }
        this.emit(msg.type, msg);
      });

      this.ws.addEventListener('error', (err) => {
        clearTimeout(timeout);
        reject(err);
      });

      this.ws.addEventListener('close', () => {
        this.emit('disconnected', {});
      });
    });
  }

  on(type, fn) {
    if (!this.handlers.has(type)) this.handlers.set(type, []);
    this.handlers.get(type).push(fn);
  }

  off(type, fn) {
    const arr = this.handlers.get(type) || [];
    this.handlers.set(type, arr.filter(f => f !== fn));
  }

  emit(type, msg) {
    (this.handlers.get(type) || []).forEach(fn => {
      try { fn(msg); } catch (e) { console.error(e); }
    });
  }

  send(msg) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  createRoom() {
    this.role = 'host';
    this.send({ type: 'create-room' });
  }

  joinRoom(code) {
    this.role = 'viewer';
    this.roomCode = code;
    this.send({ type: 'join-room', roomCode: code });
  }

  leaveRoom() {
    this.send({ type: 'leave-room' });
    this.roomCode = null;
  }

  setName(name) {
    this.send({ type: 'set-name', name });
  }

  signal(to, data) {
    this.send({ type: 'signal', to, data });
  }

  sendAnnotation(annotation) {
    this.send({ type: 'annotation', annotation });
  }

  clearAnnotations() {
    this.send({ type: 'clear-annotations' });
  }

  toggleAudio(enabled) {
    this.send({ type: 'toggle-audio', enabled });
  }

  requestOffer(to) {
    this.send({ type: 'request-offer', to });
  }

  sendIceCandidate(to, candidate) {
    this.send({ type: 'ice-candidate', to, candidate });
  }

  isOpen() {
    return this.ws && this.ws.readyState === WebSocket.OPEN;
  }
}
