import { EventEmitter } from "events";
import * as kafkaNode from "kafka-node";
import * as kafkaRest from "kafka-rest";
import * as util from "util";
import { debug } from "./debug";

export interface IMessage {
    topic: string;
    value: string;
    offset: number;
    partition: number;
    highWaterOffset: number;
    key: number;
}

export interface IConsumer {
    groupId: string;

    topic: string;

    /**
     * Commits consumer offset.
     */
    commitOffset(data: any[]): Promise<void>;

    /**
     * Event Handler.
     */
    on(event: "data", listener: (message: IMessage) => void): this;
    on(event: string, listener: Function): this;

    /**
     * Closes the consumer.
     */
    close(): Promise<void>;

    /**
     * Pauses retrieval of new messages
     */
    pause();

    /**
     * Resumes retrival of messages
     */
    resume();
}

class KafkaRestConsumer implements IConsumer {
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

class KafkaNodeConsumer implements IConsumer {
    private client: kafkaNode.Client;
    private offset: kafkaNode.Offset;
    private instance: kafkaNode.HighLevelConsumer;
    private events = new EventEmitter();
    private connecting = false;
    private connected = false;

    constructor(
        private endpoint: string,
        private clientId: string,
        public groupId: string,
        public topic: string,
        private autoCommit: boolean) {
        this.connect();
    }

    public commitOffset(commitRequest: any[]): Promise<void> {
        commitRequest.forEach((commit) => commit.topic = this.topic);
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

    public async close(): Promise<void> {
        await util.promisify(((callback) => this.instance.close(false, callback)) as Function)();
        await util.promisify(((callback) => this.client.close(callback)) as Function)();
    }

    public on(event: string, listener: (...args: any[]) => void): this {
        this.events.on(event, listener);
        return this;
    }

    public pause() {
        this.instance.pause();
    }

    public resume() {
        this.instance.resume();
    }

    private connect() {
        this.client = new kafkaNode.Client(this.endpoint, this.clientId);
        this.offset = new kafkaNode.Offset(this.client);
        const groupId = this.groupId;
        return new Promise<any>((resolve, reject) => {
            this.ensureTopics(this.client, [this.topic]).then(
                () => {
                    this.instance = new kafkaNode.HighLevelConsumer(this.client, [{topic: this.topic}], <any> {
                        autoCommit: this.autoCommit,
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

export function create(
    type: string,
    endPoint: string,
    clientId: string,
    groupId: string,
    topic: string,
    autoCommit: boolean): IConsumer {
    return type === "kafka-rest"
        ? new KafkaRestConsumer(endPoint, groupId, topic, autoCommit)
        : new KafkaNodeConsumer(endPoint, clientId, groupId, topic, autoCommit);
}
