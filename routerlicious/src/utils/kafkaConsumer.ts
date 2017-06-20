import { EventEmitter } from "events";
import * as kafkaNode from "kafka-node";
import * as kafkaRest from "kafka-rest";
import { debug } from "./debug";

export interface IConsumer {
    /**
     * Commits consumer offset.
     */
    commitOffset(data: any): Promise<void>;

    /**
     * Event Handler.
     */
    on(event: string, listener: Function): this;

    /**
     * Closes the consumer.
     */
    close();
}

class KafkaRestConsumer implements IConsumer {
    private client: any;
    private instance: any;
    private events = new EventEmitter();
    private connecting = false;
    private connected = false;

    constructor(private endpoint: string, private groupId: string, private topic: string) {
        this.connect();
    }

    public commitOffset(commitRequest: any): Promise<void> {
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

    public close() {
        this.instance.shutdown();
    }

    public on(event: string, listener: Function): this {
        this.events.on(event, listener);
        return this;
    }

    private connect() {
        // Exit out if we are already connected or are in the process of connecting
        if (this.connected || this.connecting) {
            return;
        }

        this.connecting = true;

        this.client = new kafkaRest({url: this.endpoint});

        this.client.consumer(this.groupId).join({
            "auto.commit.enable": "false",
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

class KafkaNodeConsumer implements IConsumer {
    private client: kafkaNode.Client;
    private offset: kafkaNode.Offset;
    private instance: kafkaNode.HighLevelConsumer;
    private events = new EventEmitter();
    private connecting = false;
    private connected = false;

    constructor(private endpoint: string, private groupId: string, private topic: string) {
        this.connect();
    }

    public commitOffset(commitRequest: any): Promise<void> {
        return new Promise<any>((resolve, reject) => {
            this.offset.commit(this.groupId, commitRequest, (err, data) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(JSON.stringify(data));
                }
            });
        });
    }

    public close() {
        this.client.close((closeError) => {
            if (closeError) {
                debug(closeError);
            }
        });
    }

    public on(event: string, listener: Function): this {
        this.events.on(event, listener);
        return this;
    }

    private connect() {
        this.client = new kafkaNode.Client(this.endpoint, this.groupId);
        this.offset = new kafkaNode.Offset(this.client);
        const groupId = this.groupId;
        return new Promise<any>((resolve, reject) => {
            this.ensureTopics(this.client, [this.topic]).then(
                () => {
                    this.instance = new kafkaNode.HighLevelConsumer(this.client, [{topic: this.topic}], <any> {
                        autoCommit: false,
                        fetchMaxBytes: 1024 * 1024,
                        fetchMinBytes: 1,
                        fromOffset: true,
                        groupId,
                        id: groupId,
                        maxTickMessages: 100000,
                    });

                    this.connected = true;
                    this.connecting = false;

                    this.instance.on("message", (message: any) => {
                        this.events.emit("data", message);
                    });

                    this.instance.on("error", (error) => {
                        // Workaround to resolve rebalance partition error.
                        // https://github.com/SOHU-Co/kafka-node/issues/90
                        debug(`Error in kafka consumer: ${error}. Wait for 30 seconds and return error...`);
                        setTimeout(() => {
                            this.events.emit("error", error);
                        }, 30000);
                    });

                }, (error) => {
                    this.handleError(error);
                });
        });
    }

    private ensureTopics(client: kafkaNode.Client, topics: string[]): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            // We make use of a refreshMetadata call to validate the given topics exist
            client.refreshMetadata(
                topics,
                (error, data) => {
                    if (error) {
                        debug(error);
                        return reject();
                    }
                    return resolve();
                });
        });
    }

    /**
     * Handles an error that requires a reconnect to Kafka
     */
    private handleError(error: any) {
        // Close the client if it exists
        if (this.client) {
            this.client.close((closeError) => {
                if (closeError) {
                    debug(closeError);
                }
            });
            this.client = undefined;
        }

        this.connecting = this.connected = false;
        debug("Kafka error - attempting reconnect", error);
        this.connect();
    }
}

export function create(type: string, endPoint: string, groupId: string, topic: string): IConsumer {
    return type === "kafka-rest" ? new KafkaRestConsumer(endPoint, groupId, topic)
                                 : new KafkaNodeConsumer(endPoint, groupId, topic);
}
