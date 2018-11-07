import { Deferred } from "@prague/utils";
import * as redis from "redis";
import * as ws from "ws";

export interface ISubscriptionDetails {
    joinP: Promise<void>;
    members: Set<ws>;
}

export class RedisSubscriptionManager {
    private client: redis.RedisClient;
    private subscriptions = new Map<string, ISubscriptionDetails>();

    constructor(host: string, port: number) {
        this.client = redis.createClient(6379, "redis");

        this.client.on("message", (topic, messageStr) => {
            const details = this.subscriptions.get(topic);
            if (!details) {
                return;
            }

            for (const socket of details.members) {
                socket.send(messageStr);
            }
        });
    }

    public async subscribe(topic: string, socket: ws): Promise<void> {
        if (!this.subscriptions.has(topic)) {
            const deferred = new Deferred<void>();
            this.subscriptions.set(topic, { joinP: deferred.promise, members: new Set<ws>() });

            this.client.subscribe(topic, (error) => {
                if (error) {
                    deferred.reject(error);
                } else {
                    deferred.resolve();
                }
            });
        }

        const details = this.subscriptions.get(topic);
        await details.joinP;

        details.members.add(socket);
    }

    public unsubscribe(topic: string, socket: ws) {
        const details = this.subscriptions.get(topic);
        if (!details) {
            return;
        }

        details.members.delete(socket);
        if (details.members.size === 0) {
            this.subscriptions.delete(topic);
            this.client.unsubscribe(topic);
        }
    }
}
