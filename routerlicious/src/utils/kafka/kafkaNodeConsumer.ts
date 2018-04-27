import { EventEmitter } from "events";
import * as kafkaNode from "kafka-node";
import * as util from "util";
import { debug } from "../debug";
import { IConsumer } from "./definitions";

export class KafkaNodeConsumer implements IConsumer {
    private client: kafkaNode.Client;
    private offset: kafkaNode.Offset;
    private instance: kafkaNode.HighLevelConsumer;
    private events = new EventEmitter();

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
                    debug("###############################################");
                    debug("###############################################");
                    debug(`new HighLevelConsumer(${this.topic}, ${this.autoCommit}, ${groupId}`);
                    debug("###############################################");
                    debug("###############################################");
                    this.instance = new kafkaNode.HighLevelConsumer(this.client, [{topic: this.topic}], <any> {
                        autoCommit: this.autoCommit,
                        fetchMaxBytes: 1024 * 1024,
                        fetchMinBytes: 1,
                        fromOffset: true,
                        groupId,
                        maxTickMessages: 100000,
                    });

                    this.instance.on("rebalancing", () => {
                        debug("!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!");
                        debug("!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!");
                        debug("!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!");
                        debug("!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!");
                        debug("!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!");
                        debug("");
                        debug(`Rebalancing ${(this.instance as any).id}`);
                        debug(JSON.stringify((<any> this.instance).getTopicPayloads()));
                        debug("");
                        debug("!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!");
                        debug("!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!");
                        debug("!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!");
                        debug("!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!");
                        debug("!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!");
                        debug("!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!");
                    });

                    this.instance.on("rebalanced", () => {
                        debug("***********************************************");
                        debug("***********************************************");
                        debug("***********************************************");
                        debug("***********************************************");
                        debug("***********************************************");
                        debug("***********************************************");
                        debug("");
                        debug("Rebalanced");
                        debug(JSON.stringify((<any> this.instance).getTopicPayloads()));
                        debug("");
                        debug("***********************************************");
                        debug("***********************************************");
                        debug("***********************************************");
                        debug("***********************************************");
                        debug("***********************************************");
                        debug("***********************************************");
                    });

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
                (error) => {
                    if (error) {
                        return reject(error);
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
            this.client.close();
            this.client = undefined;
        }

        debug("Kafka error - attempting reconnect", error);
        this.connect();
    }
}
