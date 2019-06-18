/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { BoxcarType, IBoxcarMessage, IPendingBoxcar, IProducer } from "@prague/services-core";
import * as utils from "@prague/utils";
import * as kafkaNode from "kafka-node";
import * as util from "util";
import { debug } from "./debug";

// 1MB batch size / (16KB max message size + overhead)
const MaxBatchSize = 32;

class PendingBoxcar implements IPendingBoxcar {
    public deferred = new utils.Deferred<void>();
    public messages = [];

    constructor(public tenantId: string, public documentId: string) {
    }
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

    constructor(
        private endpoint: string,
        private clientId: string,
        private topic: string) {
        this.connect();
    }

    /**
     * Sends the provided message to Kafka
     */
    public send(message: object, tenantId: string, documentId: string): Promise<any> {
        const key = `${tenantId}/${documentId}`;

        // Get the list of boxcars for the given key
        if (!this.messages.has(key)) {
            this.messages.set(key, [new PendingBoxcar(tenantId, documentId)]);
        }
        const boxcars = this.messages.get(key);

        // Create a new boxcar if necessary (will only happen when not connected)
        if (boxcars[boxcars.length - 1].messages.length >= MaxBatchSize) {
            boxcars.push(new PendingBoxcar(tenantId, documentId));
        }

        // Add the message to the boxcar
        const boxcar = boxcars[boxcars.length - 1];
        boxcar.messages.push(message);

        // If adding a new message to the boxcar filled it up, and we are connected, then send immediately. Otherwise
        // request a send
        if (this.connected && boxcar.messages.length >= MaxBatchSize) {
            // Send all the boxcars
            this.sendBoxcars(boxcars);
            this.messages.delete(key);
        } else {
            // Mark the need to send a message
            this.requestSend();
        }

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
            this.sendBoxcars(value);
        }

        this.messages.clear();
    }

    private sendBoxcars(boxcars: IPendingBoxcar[]) {
        for (const boxcar of boxcars) {
            const boxcarMessage: IBoxcarMessage = {
                contents: boxcar.messages,
                documentId: boxcar.documentId,
                tenantId: boxcar.tenantId,
                type: BoxcarType,
            };

            const stringifiedMessage = Buffer.from(JSON.stringify(boxcarMessage));
            this.producer.send(
                [{ key: boxcar.documentId, messages: stringifiedMessage, topic: this.topic }],
                (error, data) => error ? boxcar.deferred.reject(error) : boxcar.deferred.resolve());
        }
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
