import { EventData, EventHubClient } from "@azure/event-hubs";
import { IPendingBoxcar, IProducer } from "@prague/services-core";
import * as utils from "@prague/utils";

// 1MB batch size / (16KB max message size + overhead)
const MaxBatchSize = 32;

class PendingBoxcar implements IPendingBoxcar {
    public deferred = new utils.Deferred<void>();
    public messages = new Array<EventData>();

    constructor(public tenantId: string, public documentId: string) {
    }
}

export class EventHubProducer implements IProducer {
    private messages = new Map<string, PendingBoxcar>();
    private sendPending: NodeJS.Immediate;
    private client: EventHubClient;

    constructor(endpoint: string, topic: string) {
        this.client = EventHubClient.createFromConnectionString(
            endpoint,
            topic);
    }

    /**
     * Sends the provided message to Kafka
     */
    public send(message: any, tenantId: string, documentId: string): Promise<any> {
        const key = `${tenantId}/${documentId}`;

        // Get the list of boxcars for the given key
        if (!this.messages.has(key)) {
            this.messages.set(key, new PendingBoxcar(tenantId, documentId));
        }
        const boxcar = this.messages.get(key);

        // Add the message to the boxcar
        boxcar.messages.push({ body: message });

        // If adding a new message to the boxcar filled it up, and we are connected, then send immediately. Otherwise
        // request a send
        if (boxcar.messages.length >= MaxBatchSize) {
            // Send all the boxcars
            this.sendBoxcar(boxcar);
            this.messages.delete(key);
        } else {
            // Mark the need to send a message
            this.requestSend();
        }

        return boxcar.deferred.promise;
    }

    public async close(): Promise<void> {
        return this.client.close();
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
            this.sendBoxcar(value);
        }

        this.messages.clear();
    }

    private sendBoxcar(boxcar: IPendingBoxcar) {
        boxcar.messages[0].partitionKey = boxcar.documentId;
        this.client
            .sendBatch(boxcar.messages)
            .then(() => boxcar.deferred.resolve());
    }
}
