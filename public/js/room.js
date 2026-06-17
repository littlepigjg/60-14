(async function () {
  const mode = sessionStorage.getItem('mode');
  const savedName = sessionStorage.getItem('userName') || '';
  const savedRoomCode = sessionStorage.getItem('roomCode');

  if (!mode || (mode === 'viewer' && !savedRoomCode)) {
    location.href = '/';
    return;
  }

  const $ = Utils.$;
  const $$ = Utils.$$;

  const roleTag = $('#roleTag');
  const connStatus = $('#connStatus');
  const roomBadge = $('#roomBadge');
  const roomCodeText = $('#roomCodeText');
  const waitTitle = $('#waitTitle');
  const waitSubtitle = $('#waitSubtitle');
  const waitingScreen = $('#waitingScreen');
  const videoPlayer = $('#videoPlayer');
  const annotCanvas = $('#annotCanvas');
  const partList = $('#partList');
  const partCount = $('#partCount');
  const audioBtn = $('#audioBtn');
  const leaveBtn = $('#leaveBtn');

  roleTag.textContent = mode === 'host' ? '主持人' : '观看者';
  roleTag.className = 'role-tag ' + (mode === 'host' ? 'host' : 'viewer');

  const signaling = new SignalingClient();
  let webrtc = null;
  let annotation = null;
  let roomInfo = null;

  const userName = savedName || (mode === 'host' ? '主持人' : '观众') + Math.floor(Math.random() * 1000);

  try {
    await signaling.connect();
    signaling.setName(userName);
    connStatus.style.background = '#10b981';
    connStatus.textContent = '已连接';
  } catch (e) {
    connStatus.style.background = '#dc2626';
    connStatus.textContent = '连接失败';
    UI.toast('信令服务器连接失败');
    return;
  }

  annotation = new AnnotationManager(annotCanvas, signaling);
  setupAnnotationTools(annotation);

  webrtc = new WebRTCManager(signaling, signaling.clientId);
  webrtc.onStreamAdded = (peerId, stream) => {
    if (mode === 'viewer') {
      videoPlayer.srcObject = stream;
      waitingScreen.style.display = 'none';
      scheduleResize();
    }
  };
  webrtc.onStreamRemoved = (peerId) => {
    if (mode === 'viewer' && videoPlayer.srcObject) {
      const tracks = videoPlayer.srcObject.getVideoTracks();
      if (!tracks.length || tracks[0].readyState === 'ended') {
        videoPlayer.srcObject = null;
      }
    }
  };
  webrtc.emitStreamEnded = () => {
    if (mode === 'host') {
      UI.toast('屏幕共享已停止，正在重新请求...');
      location.reload();
    }
  };

  roomBadge.addEventListener('click', () => {
    if (signaling.roomCode) {
      UI.copyText(signaling.roomCode);
    }
  });

  audioBtn.addEventListener('click', async () => {
    const enabled = await webrtc.toggleAudio();
    audioBtn.classList.toggle('active', enabled);
    audioBtn.querySelector('span').textContent = enabled ? '麦克风开' : '麦克风';
    UI.toast(enabled ? '麦克风已开启' : '麦克风已关闭');
  });

  leaveBtn.addEventListener('click', () => {
    if (confirm('确定要离开房间吗？')) {
      cleanup();
      location.href = '/';
    }
  });

  signaling.on('room-created', (msg) => {
    signaling.roomCode = msg.roomCode;
    roomCodeText.textContent = msg.roomCode;
    UI.toast('房间创建成功，房间码: ' + msg.roomCode);
  });

  signaling.on('room-joined', (msg) => {
    signaling.roomCode = msg.roomCode;
    roomCodeText.textContent = msg.roomCode;
    if (msg.annotations && msg.annotations.length) {
      annotation.loadInitial(msg.annotations);
    }
    UI.toast('已加入房间');
    setTimeout(() => {
      signaling.requestOffer(msg.hostId);
    }, 400);
  });

  signaling.on('room-info', (msg) => {
    roomInfo = msg.info;
    renderParticipants(msg.info);
  });

  signaling.on('peer-joined', (msg) => {
    UI.toast(`${msg.name} 加入了房间`);
    if (mode === 'host') {
      setTimeout(() => webrtc.initiateConnection(msg.peerId), 300);
    }
  });

  signaling.on('peer-left', (msg) => {
    webrtc.removePeer(msg.peerId);
  });

  signaling.on('room-destroyed', () => {
    UI.toast('主持人已结束共享，房间已关闭');
    setTimeout(() => {
      cleanup();
      location.href = '/';
    }, 1500);
  });

  signaling.on('error', (msg) => {
    UI.toast(msg.message || '错误');
    if (msg.message === '房间不存在') {
      setTimeout(() => { location.href = '/'; }, 1500);
    }
  });

  signaling.on('signal', async (msg) => {
    const data = msg.data;
    if (data.type === 'offer') {
      await webrtc.handleOffer(msg.from, data.sdp);
    } else if (data.type === 'answer') {
      await webrtc.handleAnswer(msg.from, data.sdp);
    }
  });

  signaling.on('ice-candidate', (msg) => {
    webrtc.handleIceCandidate(msg.from, msg.candidate);
  });

  signaling.on('request-offer', (msg) => {
    if (mode === 'host') {
      webrtc.initiateConnection(msg.from);
    }
  });

  signaling.on('annotation', (msg) => {
    annotation.receiveAnnotation(msg.annotation);
  });

  signaling.on('clear-annotations', () => {
    annotation.annotations = [];
    annotation.render();
    UI.toast('标注已被清空');
  });

  signaling.on('disconnected', () => {
    connStatus.style.background = '#dc2626';
    connStatus.textContent = '已断开';
    UI.toast('与服务器连接断开');
  });

  function renderParticipants(info) {
    if (!info) return;
    partCount.textContent = info.clients.length;
    UI.renderParticipantList(partList, info.clients, signaling.clientId);
  }

  function setupAnnotationTools(ann) {
    $$('.tool-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        $$('.tool-btn').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        ann.setTool(btn.dataset.tool);
      });
    });
    $$('.color-swatch').forEach((sw) => {
      sw.addEventListener('click', () => {
        $$('.color-swatch').forEach((s) => s.classList.remove('active'));
        sw.classList.add('active');
        ann.setColor(sw.dataset.color);
      });
    });
    const strokeSlider = $('#strokeSlider');
    const strokeValue = $('#strokeValue');
    strokeSlider.addEventListener('input', () => {
      const v = parseInt(strokeSlider.value, 10);
      strokeValue.textContent = v;
      ann.setStroke(v);
    });
    $('#undoBtn').addEventListener('click', () => ann.undo());
    $('#clearBtn').addEventListener('click', () => {
      if (confirm('确定清空所有标注吗？')) ann.clearAll();
    });
  }

  const scheduleResize = Utils.debounce(() => {
    annotation._setupCanvas();
  }, 100);

  videoPlayer.addEventListener('loadedmetadata', scheduleResize);

  function cleanup() {
    try { signaling.leaveRoom(); } catch (e) { /* ignore */ }
    try { webrtc.destroy(); } catch (e) { /* ignore */ }
  }
  window.addEventListener('beforeunload', cleanup);

  if (mode === 'host') {
    waitTitle.textContent = '正在请求屏幕共享权限...';
    waitSubtitle.textContent = '请选择要共享的窗口或屏幕';
    try {
      const stream = await webrtc.acquireDisplay();
      videoPlayer.srcObject = stream;
      waitingScreen.style.display = 'none';
      signaling.createRoom();
      scheduleResize();
    } catch (e) {
      waitTitle.textContent = '屏幕共享未授权';
      waitSubtitle.textContent = '请刷新页面并授权屏幕捕获';
      connStatus.style.background = '#dc2626';
      connStatus.textContent = '未授权';
      UI.toast('需要授权屏幕捕获才能继续');
    }
  } else {
    waitTitle.textContent = '等待主持人开始共享...';
    waitSubtitle.textContent = '房间码: ' + savedRoomCode;
    signaling.joinRoom(savedRoomCode);
  }
})();
