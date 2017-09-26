import { EventEmitter } from "events";
import * as redis from "redis";
import * as socketIoEmitter from "socket.io-emitter";
import * as util from "util";
import * as core from "../core";

export class SocketIoRedisTopic implements core.ITopic {
    constructor(private topic: any) {
    }

    public emit(event: string, ...args: any[]) {
        this.topic.emit(event, ...args);
    }
}

export class SocketIoRedisPublisher implements core.IPublisher {
    private redisClient: redis.RedisClient;
    private io: any;
    private events = new EventEmitter();
    private topics: { [topic: string]: SocketIoRedisTopic } = {};

    constructor(port: number, host: string) {
        this.redisClient = redis.createClient(port, host);
        this.io = socketIoEmitter(this.redisClient);

        this.redisClient.on("error", (error) => {
            this.events.emit("error", error);
        });
    }

    public on(event: string, listener: (...args: any[]) => void) {
        this.events.on(event, listener);
    }

    public to(topic: string): core.ITopic {
        if (!(topic in this.topics)) {
            this.topics[topic] = new SocketIoRedisTopic(this.io.to(topic));
        }

        return this.topics[topic];
    }

    public close(): Promise<void> {
        return util.promisify(((callback) => this.redisClient.quit(callback)) as Function)();
    }
}
