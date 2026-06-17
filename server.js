const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const os = require('os');

const RoomManager = require('./src/room-manager');
const SignalingHandler = require('./src/signaling-handler');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(express.static(path.join(__dirname, 'public')));

const roomManager = new RoomManager();
const signaling = new SignalingHandler(wss, roomManager);

const PORT = process.env.PORT || 3000;

server.listen(PORT, '0.0.0.0', () => {
  const ifaces = os.networkInterfaces();
  console.log('========================================');
  console.log('  屏幕共享标注工具已启动');
  console.log('========================================');
  console.log(`  本机访问: http://localhost:${PORT}`);
  Object.keys(ifaces).forEach((iface) => {
    ifaces[iface].forEach((addr) => {
      if (addr.family === 'IPv4' && !addr.internal) {
        console.log(`  局域网访问: http://${addr.address}:${PORT}`);
      }
    });
  });
  console.log('========================================');
});
