// tslint:disable:ban-types
import * as kafkaNode from "kafka-node";
import * as util from "util";
import { debug } from "../debug";
import { IPendingMessage, IProducer } from "./definitions";
import { Producer } from "./producer";

/**
 * Kafka-Node Producer.
 */
export class KafkaNodeProducer extends Producer implements IProducer {
    private connecting = false;
    private connected = false;

    constructor(
        private endpoint: string,
        private clientId: string,
        private topic: string,
        maxMessageSize: number) {
        super(maxMessageSize);
        this.connect();
    }

    public async close(): Promise<void> {
        const producer = this.producer as kafkaNode.Producer;
        const client = this.client as kafkaNode.Client;

        await util.promisify(((callback) => producer.close(callback)) as (Function))();
        await util.promisify(((callback) => client.close(callback)) as Function)();
    }

    protected sendCore(messages: {[key: string]: IPendingMessage[] }) {
        const kafkaMessages = new Array<{ key: string, messages: string[], topic: string }>();

        // tslint:disable-next-line:forin
        for (const key in messages) {
            const pendingMessages = messages[key].map((pendingMessage) => pendingMessage.message);

            while (pendingMessages.length > 0) {
                let sendSize = 0;
                let i = 0;
                for (; i < pendingMessages.length; i++) {
                    sendSize += pendingMessages[i].length;
                    if (sendSize >= this.maxMessageSize) {
                        break;
                    }
                }

                const sendBatch = pendingMessages.splice(0, i);
                const kafkaMessage = {
                    key,
                    messages: sendBatch,
                    topic: this.topic,
                };
                kafkaMessages.push(kafkaMessage);
            }
        }

        const promises = new Array<Promise<void>>();
        for (const kafkaMessage of kafkaMessages) {
            promises.push(new Promise<void>((resolve, reject) => {
                this.producer.send([kafkaMessage], (error, data) => error ? reject(error) : resolve(data));
            }));
        }
        const doneP = Promise.all(promises);

        // tslint:disable-next-line:forin
        for (const key in messages) {
            const pendingMessages = messages[key];
            for (const pendingMessage of pendingMessages) {
                pendingMessage.deferred.resolve(doneP);
            }
        }
    }

    protected canSend(): boolean {
        return this.connected;
    }

    /**
     * Creates a connection to Kafka. Will reconnect on failure.
     */
    private connect() {
        // Exit out if we are already connected or are in the process of connecting
        if (this.connected || this.connecting) {
            return;
        }

        this.connecting = true;
        this.client = new kafkaNode.Client(this.endpoint, this.clientId);
        this.producer = new kafkaNode.Producer(this.client, { partitionerType: 3 });

        (this.client as any).on("error", (error) => {
            this.handleError(error);
        });

        this.producer.on("ready", () => {
            this.ensureTopics(this.client, [this.topic]).then(
                () => {
                    this.connected = true;
                    this.connecting = false;
                    this.sendPendingMessages();
                },
                (error) => {
                    this.handleError(error);
                });
        });

        this.producer.on("error", (error) => {
            this.handleError(error);
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
    /**
     * Ensures that the provided topics are ready
     */
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
}
