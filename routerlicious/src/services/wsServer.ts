import { EventEmitter } from "events";
import * as http from "http";
import * as util from "util";
import * as WebSocket from "ws";
import * as core from "../core";

class WsSocket implements core.IWebSocket {
    constructor(private socket: WebSocket) {
    }

    public on(event: string, listener: (...args: any[]) => void) {
        this.socket.on(event, listener);
    }

    public async join(id: string): Promise<void> {
        return Promise.resolve();
    }
}

class WsServer implements core.IWebSocketServer {
    private events = new EventEmitter();

    constructor(private io: WebSocket.Server) {
        this.io.on("connection", (socket: WebSocket) => {
            const webSocket = new WsSocket(socket);
            this.events.emit("connection", webSocket);
        });
    }

    public on(event: string, listener: (...args: any[]) => void) {
        this.events.on(event, listener);
    }

    public async close(): Promise<void> {
        const ioClosedP = util.promisify(((callback) => this.io.close(callback)) as Function)();
        await Promise.resolve(ioClosedP);
    }
}

export function create(server: http.Server): core.IWebSocketServer {
    // Create and register a ws connection on the server
    let io = new WebSocket.Server( {server} );
    return new WsServer(io);
}
