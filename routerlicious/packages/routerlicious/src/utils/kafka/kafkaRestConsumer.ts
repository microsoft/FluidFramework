import { EventEmitter } from "events";
import * as kafkaRest from "kafka-rest";
import { debug } from "../debug";
import { IConsumer } from "./definitions";

export class KafkaRestConsumer implements IConsumer {
    private client: any;
    private instance: any;
    private events = new EventEmitter();
    private connecting = false;
    private connected = false;

    constructor(private endpoint: string, public groupId: string, public topic: string, private autoCommit: boolean) {
        this.connect();
    }

    public commitOffset(commitRequest: any): Promise<void> {
        commitRequest.forEach((commit) => commit.topic = this.topic);
        return new Promise<any>((resolve, reject) => {
            this.client.post(this.instance.getUri() + "/offsets", {offsets: commitRequest}, null, (err, data) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(JSON.stringify(data));
                }
            });
        });
    }

    public async close(): Promise<void> {
        this.instance.shutdown();
    }

    public on(event: string, listener: (...args: any[]) => void): this {
        this.events.on(event, listener);
        return this;
    }

    public pause() {
        // TODO implement
    }

    public resume() {
        // TODO implement
    }

    private connect() {
        // Exit out if we are already connected or are in the process of connecting
        if (this.connected || this.connecting) {
            return;
        }

        this.connecting = true;

        this.client = new kafkaRest({url: this.endpoint});

        this.client.consumer(this.groupId).join({
            "auto.commit.enable": this.autoCommit ? "true" : "false",
            "auto.offset.reset": "smallest",
        }, (error, instance) => {
            if (error) {
                this.handleError(error);
            } else {
                this.connected = true;
                this.connecting = false;

                this.instance = instance;
                const stream = instance.subscribe(this.topic);

                stream.on("data", (messages) => {
                    // for (let message of messages) {
                        // this.events.emit("data", message);
                    // }
                    this.events.emit("data", messages);
                });

                stream.on("error", (err) => {
                    this.events.emit("error", err);
                });
            }
        });
    }

    /**
     * Handles an error that requires a reconnect to Kafka
     */
    private handleError(error: any) {
        // Close the client if it exists
        if (this.client) {
            this.client = undefined;
        }

        this.connecting = this.connected = false;
        debug("Kafka error - attempting reconnect", error);
        this.connect();
    }
}
