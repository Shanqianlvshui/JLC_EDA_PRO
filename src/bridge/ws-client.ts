/**
 * Plugin ↔ relay WebSocket bridge.
 *
 * The plugin runs inside JLC EDA Pro's sandbox and cannot listen on a port.
 * The relay is the WebSocket server (on localhost:7842). The plugin is the
 * client and polls until the relay appears, then connects.
 */
export type OnRequest = (req: { id: string; method: string; params?: unknown }) => Promise<unknown>;

const RELAY_URL = "ws://127.0.0.1:7842";
const RECONNECT_BACKOFF_MS = [1000, 2000, 5000, 10000] as const;
const WS_ID = "lceda-ai-mcp-bridge";

export class WsBridge {
  private connected = false;
  private attempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private onRequest: OnRequest;
  private stopped = false;

  constructor(onRequest: OnRequest) {
    this.onRequest = onRequest;
  }

  start(): void {
    this.stopped = false;
    this.tryConnect();
  }

  stop(): void {
    this.stopped = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    try {
      eda.sys_WebSocket.close(WS_ID);
    } catch {
      // ignore
    }
    this.connected = false;
  }

  private tryConnect(): void {
    if (this.stopped) return;
    if (this.connected) return;

    try {
      eda.sys_WebSocket.register(
        WS_ID,
        RELAY_URL,
        (event) => this.handleMessage(event),
        () => {
          this.connected = true;
          this.attempt = 0;
        },
        [],
      );
    } catch {
      // EDA throws if external-interaction permission is off, or relay not yet listening
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect(): void {
    if (this.stopped) return;
    const idx = Math.min(this.attempt, RECONNECT_BACKOFF_MS.length - 1);
    const backoff = RECONNECT_BACKOFF_MS[idx] ?? 10000;
    this.attempt++;
    this.reconnectTimer = setTimeout(() => this.tryConnect(), backoff);
  }

  private async handleMessage(event: MessageEvent<unknown>): Promise<void> {
    const data = typeof event.data === "string" ? event.data : "";
    if (!data) return;

    let req: { id?: string; method?: string; params?: unknown };
    try {
      req = JSON.parse(data);
    } catch {
      return;
    }
    if (!req.method || !req.id) return;

    try {
      const result = await this.onRequest({ id: req.id, method: req.method, params: req.params });
      this.send({ jsonrpc: "2.0", id: req.id, result });
    } catch (e) {
      this.send({
        jsonrpc: "2.0",
        id: req.id,
        error: { code: -32603, message: (e as Error)?.message ?? String(e) },
      });
    }
  }

  private send(msg: unknown): void {
    if (!this.connected) return;
    const data = JSON.stringify(msg);
    try {
      eda.sys_WebSocket.send(WS_ID, data);
    } catch {
      // socket probably went away; reconnect will recover
      this.connected = false;
      this.scheduleReconnect();
    }
  }
}
