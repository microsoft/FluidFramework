import { EventEmitter } from "events";
import * as http from "http";
import * as redis from "redis";
import * as socketIo from "socket.io";
import * as socketIoRedis from "socket.io-redis";
import * as util from "util";
import * as core from "../core";

export type RequestListener = (request: http.IncomingMessage, response: http.ServerResponse) => void;

const socketJoin = util.promisify(
    (socket: SocketIO.Socket, roomId: string, callback: (err: NodeJS.ErrnoException) => void) => {
        socket.join(roomId, callback);
    });

export class WebSocket implements core.IWebSocket {
    constructor(private socket: SocketIO.Socket) {
    }

    public on(event: string, listener: (...args: any[]) => void) {
        this.socket.on(event, listener);
    }

    public async join(id: string): Promise<void> {
        await socketJoin(this.socket, id);
    }
}

export class WebSocketServer implements core.IWebSocketServer {
    private events = new EventEmitter();

    constructor(private io: SocketIO.Server) {
        this.io.on("connection", (socket: SocketIO.Socket) => {
            const webSocket = new WebSocket(socket);
            this.events.emit("connection", webSocket);
        });
    }

    public on(event: string, listener: (...args: any[]) => void) {
        this.events.on(event, listener);
    }

    public async close(): Promise<void> {
        await util.promisify(((callback) => this.io.close(callback)) as Function)();
    }
}

export class HttpServer implements core.IHttpServer {
    constructor(private server: http.Server) {
    }

    public async close(): Promise<void> {
        await util.promisify(((callback) => this.server.close(callback)) as Function)();
    }

    public listen(port: any) {
        this.server.listen(port);
    }

    public on(event: string, listener: (...args: any[]) => void) {
        this.server.on(event, listener);
    }

    public address(): { port: number; family: string; address: string; } {
        return this.server.address();
    }
}

export class WebServer implements core.IWebServer {
    constructor(public httpServer: HttpServer, public webSocketServer: WebSocketServer) {
    }

    /**
     * Closes the web server
     */
    public async close(): Promise<void> {
        await Promise.all([this.httpServer.close(), this.webSocketServer.close()]);
    }
}

export class WebServerFactory implements core.IWebServerFactory {
    constructor(
        private pub: redis.RedisClient,
        private sub: redis.RedisClient) {
    }

    public create(requestListener: RequestListener): core.IWebServer {
        // Create the base HTTP server and register the provided request listener
        const server = http.createServer(requestListener);
        const httpServer = new HttpServer(server);

        // Create and register a socket.io connection on the server
        let io = socketIo();
        io.adapter(socketIoRedis({ pubClient: this.pub, subClient: this.sub }));
        io.attach(server);
        const webSocketServer = new WebSocketServer(io);

        return new WebServer(httpServer, webSocketServer);
    }
}
