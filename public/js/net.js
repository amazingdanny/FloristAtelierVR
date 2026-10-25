// Tiny WebSocket client with auto-reconnect.
export class Net {
  constructor(onMessage, onStatus = () => {}) {
    this.onMessage = onMessage;
    this.onStatus = onStatus;
    this.ws = null;
    this.queue = [];
    this.hello = null; // message re-sent on every (re)connect
    this.retry = 0;
    this.connect();
    setInterval(() => this.send({ t: 'ping', at: Date.now() }), 20000);
  }
  url() {
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${proto}//${location.host}/ws`;
  }
  connect() {
    this.onStatus('connecting');
    const ws = new WebSocket(this.url());
    this.ws = ws;
    ws.onopen = () => {
      this.retry = 0;
      this.onStatus('open');
      if (this.hello) ws.send(JSON.stringify(typeof this.hello === 'function' ? this.hello() : this.hello));
      for (const m of this.queue) ws.send(JSON.stringify(m));
      this.queue = [];
    };
    ws.onmessage = (ev) => {
      let msg; try { msg = JSON.parse(ev.data); } catch { return; }
      if (msg.t === 'pong') return;
      this.onMessage(msg);
    };
    ws.onclose = () => {
      this.onStatus('closed');
      const wait = Math.min(5000, 500 * 2 ** this.retry++);
      setTimeout(() => this.connect(), wait);
    };
    ws.onerror = () => { try { ws.close(); } catch {} };
  }
  send(msg) {
    if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify(msg));
    else if (msg.t !== 'ping' && msg.t !== 'pose' && msg.t !== 'bouquet') this.queue.push(msg);
    else if (msg.t === 'bouquet') { this.queue = this.queue.filter(m => m.t !== 'bouquet'); this.queue.push(msg); }
  }
}
