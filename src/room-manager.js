const crypto = require('crypto');

class RoomManager {
  constructor() {
    this.rooms = new Map();
  }

  generateRoomCode() {
    return crypto.randomInt(100000, 999999).toString();
  }

  createRoom() {
    let code;
    do {
      code = this.generateRoomCode();
    } while (this.rooms.has(code));

    this.rooms.set(code, {
      code,
      hostId: null,
      annotations: [],
      createdAt: Date.now()
    });

    return this.rooms.get(code);
  }

  getRoom(code) {
    return this.rooms.get(code) || null;
  }

  hasRoom(code) {
    return this.rooms.has(code);
  }

  deleteRoom(code) {
    this.rooms.delete(code);
  }

  setHost(code, clientId) {
    const room = this.rooms.get(code);
    if (room) {
      room.hostId = clientId;
    }
  }

  addAnnotation(code, annotation) {
    const room = this.rooms.get(code);
    if (room) {
      room.annotations.push(annotation);
      return annotation;
    }
    return null;
  }

  clearAnnotations(code) {
    const room = this.rooms.get(code);
    if (room) {
      room.annotations = [];
    }
  }

  deleteAnnotation(code, annotationId) {
    const room = this.rooms.get(code);
    if (room) {
      room.annotations = room.annotations.filter(a => a.id !== annotationId);
    }
  }

  getAnnotations(code) {
    const room = this.rooms.get(code);
    return room ? room.annotations : [];
  }
}

module.exports = RoomManager;
