// tslint:disable:ban-types
import { EventEmitter } from "events";
import * as http from "http";
import * as _ from "lodash";
import * as redis from "redis";
import * as socketIo from "socket.io";
import * as socketIoRedis from "socket.io-redis";
import * as util from "util";
import * as core from "../core";

const socketJoin = util.promisify(
    (socket: SocketIO.Socket, roomId: string, callback: (err: NodeJS.ErrnoException) => void) => {
        socket.join(roomId, callback);
    });

class SocketIoSocket implements core.IWebSocket {
    public get id(): string {
        return this.socket.id;
    }

    constructor(private socket: SocketIO.Socket) {
    }

    public on(event: string, listener: (...args: any[]) => void) {
        this.socket.on(event, listener);
    }

    public async join(id: string): Promise<void> {
        await socketJoin(this.socket, id);
    }

    public async emit(event: string, ...args) {
        this.socket.emit(event, ...args);
    }
}

class SocketIoServer implements core.IWebSocketServer {
    private events = new EventEmitter();

    constructor(private io: SocketIO.Server, private pub: redis.RedisClient, private sub: redis.RedisClient) {
        this.io.on("connection", (socket: SocketIO.Socket) => {
            const webSocket = new SocketIoSocket(socket);
            this.events.emit("connection", webSocket);
        });
    }

    public on(event: string, listener: (...args: any[]) => void) {
        this.events.on(event, listener);
    }

    public async close(): Promise<void> {
        const pubClosedP = util.promisify(((callback) => this.pub.quit(callback)) as Function)();
        const subClosedP = util.promisify(((callback) => this.sub.quit(callback)) as Function)();
        const ioClosedP = util.promisify(((callback) => this.io.close(callback)) as Function)();
        await Promise.all([pubClosedP, subClosedP, ioClosedP]);
    }
}

export function create(redisConfig: any, server: http.Server): core.IWebSocketServer {
    const options: any = { auth_pass: redisConfig.pass };
    if (redisConfig.tls !== undefined) {
        options.tls = {
            servername: redisConfig.host,
        };
    }

    const pubOptions = _.clone(options);
    const subOptions = _.clone(options);
    const pub = redis.createClient(redisConfig.port, redisConfig.host, pubOptions);
    const sub = redis.createClient(redisConfig.port, redisConfig.host, subOptions);

    // Create and register a socket.io connection on the server
    const io = socketIo();
    io.adapter(socketIoRedis({ pubClient: pub, subClient: sub }));
    io.attach(server);
    return new SocketIoServer(io, pub, sub);
}
