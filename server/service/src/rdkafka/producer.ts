/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { BoxcarType, IBoxcarMessage, IPendingBoxcar, IProducer } from "@prague/services-core";
import { Deferred } from "@prague/utils";
import * as Kafka from "node-rdkafka";

// 1MB batch size / 16KB max message size
const MaxBatchSize = 32;

class PendingBoxcar implements IPendingBoxcar {
    public deferred = new Deferred<void>();
    public messages = [];

    constructor(public tenantId: string, public documentId: string) {
    }
}

export class RdkafkaProducer implements IProducer {
    private messages = new Map<string, IPendingBoxcar[]>();
    private producer: Kafka.Producer;
    private connected = false;
    private sendPending: NodeJS.Immediate;

    constructor(endpoint: string, private topic: string) {
        this.producer = new Kafka.Producer(
            {
                "dr_cb": true,    // delivery report callback
                "metadata.broker.list": endpoint,
                "queue.buffering.max.ms": 1,
            },
            null);
        this.producer.setPollInterval(100);

        // logging debug messages, if debug is enabled
        this.producer.on("event.log", (log) => {
            console.log(log);
        });

        // logging all errors
        this.producer.on("event.error", (err) => {
            console.error("Error from producer");
            console.error(err);
        });

        // Wait for the ready event before producing
        this.producer.on("ready", (arg) => {
            console.log("producer ready." + JSON.stringify(arg));
        });

        this.producer.on("disconnected", (arg) => {
            console.log("producer disconnected. " + JSON.stringify(arg));
        });

        // starting the producer
        this.producer.connect(
            null,
            (error, data) => {
                console.log(`Connected`, error, data);
                this.connected = true;
                this.requestSend();
            });

        this.producer.on("delivery-report", (err, report) => {
            if (err) {
                console.error(err);
                report.opaque.reject(err);
            } else {
                report.opaque.resolve();
            }
        });
    }

    public async send(message: object, tenantId: string, documentId: string): Promise<any> {
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

    public close(): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            this.producer.disconnect((err, data) => err ? reject(err) : resolve());
        });
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

            this.producer.produce(
                this.topic,
                null,
                Buffer.from(JSON.stringify(boxcarMessage)),
                boxcar.documentId,
                Date.now(),
                boxcar.deferred);
        }
    }
}
