import * as utils from "@prague/utils";
import * as kafkaNode from "kafka-node";
import * as util from "util";
import { BoxcarType, IBoxcarMessage } from "../../core";
import { debug } from "../debug";
import { IProducer } from "./definitions";

const MaxBatchSize = Number.MAX_VALUE;

interface IPendingBoxcar {
    documentId: string;
    tenantId: string;
    deferred: utils.Deferred<void>;
    messages: string[];
    size: number;
}

/**
 * Kafka-Node Producer.
 */
export class KafkaNodeProducer implements IProducer {
    private messages = new Map<string, IPendingBoxcar[]>();
    private client: any;
    private producer: any;
    private sendPending: NodeJS.Immediate;
    private connecting = false;
    private connected = false;
    private pendingMessageCount = 0;

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
    public send(message: string, tenantId: string, documentId: string): Promise<any> {
        if (message.length >= this.maxMessageSize) {
            return Promise.reject("Message too large");
        }

        const key = `${tenantId}/${documentId}`;

        // Get the list of boxcars for the given key
        if (!this.messages.has(key)) {
            this.messages.set(key, []);
        }
        const boxcars = this.messages.get(key);

        // Create a new boxcar if necessary
        if (boxcars.length === 0 || boxcars[boxcars.length - 1].size + message.length > this.maxMessageSize) {
            boxcars.push({
                deferred: new utils.Deferred<void>(),
                documentId,
                messages: [],
                size: 0,
                tenantId,
            });
        }

        // Add the message to the boxcar
        const boxcar = boxcars[boxcars.length - 1];
        boxcar.messages.push(message);
        this.pendingMessageCount++;

        // Mark the need to send a message
        this.requestSend();

        return boxcar.deferred.promise;
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
        // If we aren't connected yet defer sending until connected
        if (!this.connected) {
            return;
        }

        // Limit max queued up batch size
        if (this.pendingMessageCount >= MaxBatchSize) {
            clearImmediate(this.sendPending);
            this.sendPending = undefined;
            this.sendPendingMessages();
            return;
        }

        // Exit early if there is a pending send
        if (this.sendPending) {
            return;
        }

        // use setImmediate to play well with the node event loop
        this.sendPending = setImmediate(() => {
            this.sendPendingMessages();
            this.sendPending = undefined;
        });
    }

    /**
     * Sends all pending messages
     */
    private sendPendingMessages() {
        for (const [, value] of this.messages) {
            for (const boxcar of value) {
                const boxcarMessage: IBoxcarMessage = {
                    contents: boxcar.messages,
                    documentId: boxcar.documentId,
                    tenantId: boxcar.tenantId,
                    type: BoxcarType,
                };

                this.producer.send(
                    [{ key: boxcar.documentId, messages: JSON.stringify(boxcarMessage), topic: this.topic }],
                    (error, data) => error ? boxcar.deferred.reject(error) : boxcar.deferred.resolve());
            }
        }

        this.pendingMessageCount = 0;
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
