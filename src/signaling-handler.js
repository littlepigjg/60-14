const { randomUUID } = require('crypto');

class SignalingHandler {
  constructor(wss, roomManager) {
    this.wss = wss;
    this.roomManager = roomManager;
    this.setupConnectionHandler();
  }

  setupConnectionHandler() {
    this.wss.on('connection', (ws) => {
      this.initializeClient(ws);
      this.bindMessageHandler(ws);
      this.bindCloseHandler(ws);
    });
  }

  initializeClient(ws) {
    ws.id = randomUUID();
    ws.role = 'viewer';
    ws.audioEnabled = false;
    ws.name = '用户' + Math.floor(Math.random() * 1000);
    ws.send(JSON.stringify({ type: 'connected', clientId: ws.id }));
  }

  bindMessageHandler(ws) {
    ws.on('message', (raw) => {
      let msg;
      try {
        msg = JSON.parse(raw);
      } catch {
        return;
      }
      this.handleMessage(ws, msg);
    });
  }

  bindCloseHandler(ws) {
    ws.on('close', () => {
      this.handleLeaveRoom(ws);
    });
  }

  handleMessage(ws, msg) {
    switch (msg.type) {
      case 'create-room':
        this.handleCreateRoom(ws);
        break;
      case 'join-room':
        this.handleJoinRoom(ws, msg);
        break;
      case 'leave-room':
        this.handleLeaveRoom(ws);
        break;
      case 'set-name':
        this.handleSetName(ws, msg);
        break;
      case 'signal':
        this.handleSignal(ws, msg);
        break;
      case 'annotation':
        this.handleAnnotation(ws, msg);
        break;
      case 'clear-annotations':
        this.handleClearAnnotations(ws);
        break;
      case 'toggle-audio':
        this.handleToggleAudio(ws, msg);
        break;
      case 'request-offer':
        this.handleRequestOffer(ws, msg);
        break;
      case 'ice-candidate':
        this.handleIceCandidate(ws, msg);
        break;
    }
  }

  getClientsInRoom(roomCode) {
    const clients = [];
    this.wss.clients.forEach((client) => {
      if (client.readyState === 1 && client.roomCode === roomCode) {
        clients.push(client);
      }
    });
    return clients;
  }

  findClientById(clientId) {
    let target = null;
    this.wss.clients.forEach((client) => {
      if (client.readyState === 1 && client.id === clientId) {
        target = client;
      }
    });
    return target;
  }

  broadcastToRoom(roomCode, message, excludeId = null) {
    const data = JSON.stringify(message);
    this.getClientsInRoom(roomCode).forEach((client) => {
      if (client.id !== excludeId) {
        client.send(data);
      }
    });
  }

  getRoomInfo(roomCode) {
    const room = this.roomManager.getRoom(roomCode);
    if (!room) return null;
    const clients = this.getClientsInRoom(roomCode);
    return {
      code: roomCode,
      hostId: room.hostId,
      clients: clients.map((c) => ({
        id: c.id,
        role: c.role,
        name: c.name,
        audioEnabled: c.audioEnabled || false
      }))
    };
  }

  broadcastRoomInfo(roomCode) {
    const info = this.getRoomInfo(roomCode);
    if (info) {
      this.broadcastToRoom(roomCode, { type: 'room-info', info });
    }
  }

  handleCreateRoom(ws) {
    const room = this.roomManager.createRoom();
    this.roomManager.setHost(room.code, ws.id);
    ws.roomCode = room.code;
    ws.role = 'host';

    ws.send(JSON.stringify({
      type: 'room-created',
      roomCode: room.code,
      clientId: ws.id,
      role: 'host'
    }));
  }

  handleJoinRoom(ws, msg) {
    const code = msg.roomCode;
    const room = this.roomManager.getRoom(code);

    if (!room) {
      ws.send(JSON.stringify({ type: 'error', message: '房间不存在' }));
      return;
    }

    ws.roomCode = code;
    ws.role = 'viewer';

    ws.send(JSON.stringify({
      type: 'room-joined',
      roomCode: code,
      clientId: ws.id,
      role: 'viewer',
      hostId: room.hostId,
      annotations: this.roomManager.getAnnotations(code)
    }));

    this.broadcastToRoom(code, {
      type: 'peer-joined',
      peerId: ws.id,
      name: ws.name,
      role: 'viewer'
    }, ws.id);

    this.broadcastRoomInfo(code);
  }

  handleLeaveRoom(ws) {
    if (!ws.roomCode) return;
    const code = ws.roomCode;
    const room = this.roomManager.getRoom(code);

    if (room && ws.role === 'host') {
      this.broadcastToRoom(code, { type: 'room-destroyed' });
      this.roomManager.deleteRoom(code);
    } else if (room) {
      this.broadcastToRoom(code, {
        type: 'peer-left',
        peerId: ws.id
      });
      this.broadcastRoomInfo(code);
    }

    ws.roomCode = null;
  }

  handleSetName(ws, msg) {
    ws.name = msg.name || ws.name;
    if (ws.roomCode) {
      this.broadcastRoomInfo(ws.roomCode);
    }
  }

  handleSignal(ws, msg) {
    const target = this.findClientById(msg.to);
    if (target) {
      target.send(JSON.stringify({
        type: 'signal',
        from: ws.id,
        data: msg.data
      }));
    }
  }

  handleAnnotation(ws, msg) {
    if (!ws.roomCode) return;
    const room = this.roomManager.getRoom(ws.roomCode);
    if (!room) return;

    const annotation = {
      id: msg.annotation.id || randomUUID(),
      ...msg.annotation,
      authorId: ws.id,
      authorName: ws.name,
      timestamp: Date.now()
    };

    if (annotation.__delete) {
      this.roomManager.deleteAnnotation(ws.roomCode, annotation.id);
    } else {
      this.roomManager.addAnnotation(ws.roomCode, annotation);
    }

    this.broadcastToRoom(ws.roomCode, {
      type: 'annotation',
      annotation
    }, ws.id);
  }

  handleClearAnnotations(ws) {
    if (!ws.roomCode) return;
    const room = this.roomManager.getRoom(ws.roomCode);
    if (!room) return;
    this.roomManager.clearAnnotations(ws.roomCode);
    this.broadcastToRoom(ws.roomCode, { type: 'clear-annotations' });
  }

  handleToggleAudio(ws, msg) {
    ws.audioEnabled = msg.enabled || false;
    if (ws.roomCode) {
      this.broadcastRoomInfo(ws.roomCode);
    }
  }

  handleRequestOffer(ws, msg) {
    const target = this.findClientById(msg.to);
    if (target) {
      target.send(JSON.stringify({
        type: 'request-offer',
        from: ws.id
      }));
    }
  }

  handleIceCandidate(ws, msg) {
    const target = this.findClientById(msg.to);
    if (target) {
      target.send(JSON.stringify({
        type: 'ice-candidate',
        from: ws.id,
        candidate: msg.candidate
      }));
    }
  }
}

module.exports = SignalingHandler;
