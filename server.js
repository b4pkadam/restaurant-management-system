import http from 'http';
import os from 'os';
import { WebSocketServer, WebSocket } from 'ws';

const PORT = Number(process.env.PORT) || 3001;
const MAX_HISTORY = 100;
const history = [];

// Helper to get local network IPv4 addresses
function getLocalNetworkAddresses() {
  const interfaces = os.networkInterfaces();
  const addresses = [];
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name] || []) {
      if (iface.family === 'IPv4' && !iface.internal) {
        addresses.push(iface.address);
      }
    }
  }
  return addresses;
}

// Create HTTP server for REST endpoints & WebSocket upgrade
const server = http.createServer((req, res) => {
  // Global CORS headers to allow GitHub Pages, local dev, and mobile devices
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);

  // Health check & status
  if (url.pathname === '/health' || url.pathname === '/') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        status: 'online',
        service: 'Restaurant Sync Server',
        version: '1.0.0',
        activeClients: wss.clients.size,
        historyCount: history.length,
        uptime: Math.round(process.uptime()),
        timestamp: new Date().toISOString(),
      })
    );
    return;
  }

  // Fetch recent message history (for catch-up sync)
  if (url.pathname === '/api/history' && req.method === 'GET') {
    const limit = Math.min(MAX_HISTORY, Number(url.searchParams.get('limit')) || 30);
    const recent = history.slice(-limit);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(recent));
    return;
  }

  // HTTP POST sync endpoint (alternative to WebSocket send)
  if (url.pathname === '/api/sync' && req.method === 'POST') {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 2 * 1024 * 1024) {
        // 2MB safeguard
        res.writeHead(413, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Payload too large' }));
        req.destroy();
      }
    });

    req.on('end', () => {
      try {
        const msg = JSON.parse(body);
        if (!msg || !msg.type) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Invalid message structure' }));
          return;
        }

        const deliveredCount = broadcastMessage(msg);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, deliveredTo: deliveredCount }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Malformed JSON body' }));
      }
    });
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not found' }));
});

// Create WebSocket server attached to the HTTP server
const wss = new WebSocketServer({ server });

function broadcastMessage(msg, senderSocket = null) {
  // Add to in-memory history ring buffer
  history.push(msg);
  if (history.length > MAX_HISTORY) {
    history.shift();
  }

  const rawJson = JSON.stringify(msg);
  let count = 0;

  wss.clients.forEach((client) => {
    if (client !== senderSocket && client.readyState === WebSocket.OPEN) {
      try {
        client.send(rawJson);
        count++;
      } catch {
        // ignore send error on broken socket
      }
    }
  });

  return count;
}

wss.on('connection', (ws, req) => {
  ws.isAlive = true;

  ws.on('pong', () => {
    ws.isAlive = true;
  });

  // Send initial catch-up history batch to freshly connected client
  try {
    const catchup = {
      type: 'SYNC_BATCH',
      payload: { messages: history.slice(-20) },
      senderId: 'SERVER',
    };
    ws.send(JSON.stringify(catchup));
  } catch {}

  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data.toString());
      if (msg && msg.type) {
        broadcastMessage(msg, ws);
      }
    } catch {
      // ignore malformed socket frame
    }
  });
});

// Periodic heartbeat to clean up disconnected/zombie sockets
const pingInterval = setInterval(() => {
  wss.clients.forEach((ws) => {
    if (ws.isAlive === false) {
      ws.terminate();
      return;
    }
    ws.isAlive = false;
    ws.ping();
  });
}, 30000);

wss.on('close', () => {
  clearInterval(pingInterval);
});

server.listen(PORT, '0.0.0.0', () => {
  const localIPs = getLocalNetworkAddresses();
  console.log('====================================================');
  console.log(`🚀 Restaurant Dedicated Sync Server is RUNNING`);
  console.log(`📡 Local Port: ${PORT}`);
  console.log(`🔗 Localhost: http://localhost:${PORT}`);
  if (localIPs.length > 0) {
    console.log('📱 Network Addresses for Mobile & Other Devices:');
    localIPs.forEach((ip) => {
      console.log(`   👉 http://${ip}:${PORT}`);
    });
  }
  console.log('====================================================');
});
