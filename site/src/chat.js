// One Durable Object holds every open chat connection and pushes new messages to them.
// Uses the WebSocket Hibernation API, so idle connections cost nothing.
import { DurableObject } from 'cloudflare:workers';

export class ChatHub extends DurableObject {
  async fetch(req) {
    const pair = new WebSocketPair();
    this.ctx.acceptWebSocket(pair[1]);
    return new Response(null, { status: 101, webSocket: pair[0] });
  }

  // Called by the Worker (RPC) after a post is saved.
  async broadcast(evt) {
    const msg = JSON.stringify(evt);
    for (const ws of this.ctx.getWebSockets()) {
      try { ws.send(msg); } catch { /* socket already closed */ }
    }
  }

  async webSocketMessage(ws, msg) {
    if (msg === 'ping') ws.send('pong');
  }

  async webSocketClose(ws, code) {
    try { ws.close(code, 'bye'); } catch {}
  }
}
