class WebRTCManager {
  constructor(signaling, localClientId) {
    this.signaling = signaling;
    this.clientId = localClientId;
    this.peerConnections = new Map();
    this.localStream = null;
    this.remoteStreams = new Map();
    this.localAudioStream = null;
    this.audioEnabled = false;
    this.onStreamAdded = null;
    this.onStreamRemoved = null;
  }

  async acquireDisplay() {
    try {
      this.localStream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: 30, cursor: 'always' },
        audio: false
      });
      this.localStream.getVideoTracks()[0].addEventListener('ended', () => {
        this.emitStreamEnded && this.emitStreamEnded();
      });
      return this.localStream;
    } catch (e) {
      console.error('getDisplayMedia failed:', e);
      throw e;
    }
  }

  async acquireAudio() {
    try {
      this.localAudioStream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        video: false
      });
      this.audioEnabled = true;
      this.signaling.toggleAudio(true);
      this._addAudioToAllPeers();
      return true;
    } catch (e) {
      console.error('getUserMedia audio failed:', e);
      this.audioEnabled = false;
      this.signaling.toggleAudio(false);
      return false;
    }
  }

  stopAudio() {
    if (this.localAudioStream) {
      this.localAudioStream.getTracks().forEach(t => t.stop());
      this.localAudioStream = null;
    }
    this.audioEnabled = false;
    this.signaling.toggleAudio(false);
    this._removeAudioFromAllPeers();
  }

  toggleAudio() {
    if (this.audioEnabled) {
      this.stopAudio();
      return false;
    }
    return this.acquireAudio();
  }

  _addAudioToAllPeers() {
    if (!this.localAudioStream) return;
    this.peerConnections.forEach(pc => {
      this.localAudioStream.getAudioTracks().forEach(track => {
        const existing = pc.getSenders().find(s => s.track && s.track.id === track.id);
        if (!existing) pc.addTrack(track, this.localAudioStream);
      });
    });
    this._renegotiateAll();
  }

  _removeAudioFromAllPeers() {
    this.peerConnections.forEach(pc => {
      pc.getSenders().forEach(sender => {
        if (sender.track && sender.track.kind === 'audio') {
          try { pc.removeTrack(sender); } catch {}
        }
      });
    });
    this._renegotiateAll();
  }

  async _renegotiateAll() {
    for (const [peerId, pc] of this.peerConnections.entries()) {
      try {
        await this._createAndSendOffer(peerId, pc);
      } catch (e) {
        console.warn('renegotiate failed for', peerId, e);
      }
    }
  }

  createPeerConnection(peerId, isOfferer) {
    if (this.peerConnections.has(peerId)) return this.peerConnections.get(peerId);

    const pc = new RTCPeerConnection({
      iceServers: []
    });

    if (this.localStream) {
      this.localStream.getVideoTracks().forEach(track => {
        pc.addTrack(track, this.localStream);
      });
    }
    if (this.localAudioStream) {
      this.localAudioStream.getAudioTracks().forEach(track => {
        pc.addTrack(track, this.localAudioStream);
      });
    }

    pc.ontrack = (ev) => {
      const stream = ev.streams[0];
      if (stream) {
        this.remoteStreams.set(peerId, stream);
        if (this.onStreamAdded) this.onStreamAdded(peerId, stream);
      }
    };

    pc.onicecandidate = (ev) => {
      if (ev.candidate) {
        this.signaling.sendIceCandidate(peerId, ev.candidate);
      }
    };

    pc.oniceconnectionstatechange = () => {
      if (pc.iceConnectionState === 'failed' || pc.iceConnectionState === 'disconnected') {
        console.warn('ICE state', pc.iceConnectionState, 'for', peerId);
        if (pc.iceConnectionState === 'failed') {
          pc.restartIce();
        }
      }
      if (pc.iceConnectionState === 'closed') {
        if (this.onStreamRemoved) this.onStreamRemoved(peerId);
        this.remoteStreams.delete(peerId);
      }
    };

    this.peerConnections.set(peerId, pc);
    return pc;
  }

  async _createAndSendOffer(peerId, pc) {
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    this.signaling.signal(peerId, {
      type: 'offer',
      sdp: pc.localDescription.sdp
    });
  }

  async initiateConnection(peerId) {
    const pc = this.createPeerConnection(peerId, true);
    await this._createAndSendOffer(peerId, pc);
  }

  async handleOffer(fromPeerId, sdp) {
    const pc = this.createPeerConnection(fromPeerId, false);
    await pc.setRemoteDescription({ type: 'offer', sdp });
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    this.signaling.signal(fromPeerId, {
      type: 'answer',
      sdp: pc.localDescription.sdp
    });
  }

  async handleAnswer(fromPeerId, sdp) {
    const pc = this.peerConnections.get(fromPeerId);
    if (pc) {
      await pc.setRemoteDescription({ type: 'answer', sdp });
    }
  }

  async handleIceCandidate(fromPeerId, candidate) {
    const pc = this.peerConnections.get(fromPeerId);
    if (pc && candidate) {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (e) {
        console.warn('addIceCandidate failed:', e);
      }
    }
  }

  handleRequestOffer(fromPeerId) {
    this.initiateConnection(fromPeerId);
  }

  removePeer(peerId) {
    const pc = this.peerConnections.get(peerId);
    if (pc) {
      try { pc.close(); } catch {}
      this.peerConnections.delete(peerId);
    }
    if (this.remoteStreams.has(peerId)) {
      if (this.onStreamRemoved) this.onStreamRemoved(peerId);
      this.remoteStreams.delete(peerId);
    }
  }

  destroy() {
    if (this.localStream) {
      this.localStream.getTracks().forEach(t => t.stop());
    }
    if (this.localAudioStream) {
      this.localAudioStream.getTracks().forEach(t => t.stop());
    }
    this.peerConnections.forEach(pc => { try { pc.close(); } catch {} });
    this.peerConnections.clear();
    this.remoteStreams.clear();
  }
}
