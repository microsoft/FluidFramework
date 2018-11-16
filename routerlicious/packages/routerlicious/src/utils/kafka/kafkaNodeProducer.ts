import * as utils from "@prague/utils";
import * as kafkaNode from "kafka-node";
import * as util from "util";
import { debug } from "../debug";
import { IPendingMessage, IProducer } from "./definitions";

/**
 * Kafka-Node Producer.
 */
export class KafkaNodeProducer implements IProducer {
    private messages = new Map<string, IPendingMessage[]>();
    private client: any;
    private producer: any;
    private sendPending = false;
    private connecting = false;
    private connected = false;

    constructor(
        private endpoint: string,
        private clientId: string,
        private topic: string,
        private maxMessageSize: number) {
        this.maxMessageSize = maxMessageSize * 0.75;
        this.connect();
    }

    /**
     * Sends the provided message to Kafka
     */
    public send(message: string, key: string): Promise<any> {
        if (message.length >= this.maxMessageSize) {
            return Promise.reject("Message too large");
        }

        // Get the list of pending messages for the given key
        if (!this.messages.has(key)) {
            this.messages.set(key, []);
        }
        const pending = this.messages.get(key);

        // Insert a new pending message
        const deferred = new utils.Deferred<any>();
        pending.push({ deferred, message });

        // Mark the need to send a message
        this.requestSend();

        return deferred.promise;
    }

    public async close(): Promise<void> {
        const producer = this.producer as kafkaNode.Producer;
        const client = this.client as kafkaNode.Client;

        await util.promisify(((callback) => producer.close(callback)) as any)();
        await util.promisify(((callback) => client.close(callback)) as any)();
    }

    /**
     * Notifies of the need to send pending messages. We defer sending messages to batch together messages
     * to the same partition.
     */
    private requestSend() {
        // Exit early if there is a pending send
        if (this.sendPending) {
            return;
        }

        // If we aren't connected yet defer sending until connected
        if (!this.connected) {
            return;
        }

        this.sendPending = true;

        // use setImmediate to play well with the node event loop
        setImmediate(() => {
            this.sendPendingMessages();
            this.sendPending = false;
        });
    }

    /**
     * Sends all pending messages
     */
    private sendPendingMessages() {
        // TODO let's log to influx how many messages we have batched
        const kafkaMessages = new Array<{ key: string, messages: string[], topic: string }>();

        for (const [key, value] of this.messages) {
            const pendingMessages = value.map((pendingMessage) => pendingMessage.message);

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

        for (const [, pendingMessages] of this.messages) {
            for (const pendingMessage of pendingMessages) {
                pendingMessage.deferred.resolve(doneP);
            }
        }

        this.messages.clear();
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
