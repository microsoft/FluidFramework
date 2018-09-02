import * as utils from "@prague/utils";
import { IPendingMessage, IProducer } from "./definitions";

/**
 * Base producer responsible for batching and sending.
 */
export abstract class Producer implements IProducer {
    protected messages: {[key: string]: IPendingMessage[]} = {};
    protected client: any;
    protected producer: any;
    protected sendPending = false;

    constructor(private maxSendSize = 100) {
    }

    /**
     * Sends the provided message to Kafka
     */
    public send(message: string, key: string): Promise<any> {
        // Get the list of pending messages for the given key
        if (!(key in this.messages)) {
            this.messages[key] = [];
        }
        const pending = this.messages[key];

        // Insert a new pending message
        const deferred = new utils.Deferred<any>();
        pending.push({ deferred, message });

        // Mark the need to send a message
        this.requestSend();

        return deferred.promise;
    }

    public abstract close(): Promise<void>;

    /**
     * Sends all pending messages
     */
    protected sendPendingMessages() {
        // TODO let's log to influx how many messages we have batched

        // tslint:disable-next-line:forin
        for (const key in this.messages) {
            const messages = this.messages[key];

            while (messages.length > 0) {
                const sendBatch = messages.splice(0, this.maxSendSize);
                this.sendCore(key, sendBatch);
            }
        }
        this.messages = {};
    }

    /**
     * Sends the list of messages for the given key
     */
    protected abstract sendCore(key: string, messages: IPendingMessage[]);

    /**
     * Indicates whether it's possible to send messages or not
     */
    protected abstract canSend(): boolean;

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
        if (!this.canSend()) {
            return;
        }

        this.sendPending = true;

        // use setImmediate to play well with the node event loop
        setImmediate(() => {
            this.sendPendingMessages();
            this.sendPending = false;
        });
    }
}
