import * as kafka from "kafka-rest";
import { debug } from "./debug";
import { Deferred } from "./promises";

/**
 * Ensures that the provided topics are ready
 */
export function ensureTopics(client: kafka.Client, topics: string[]): Promise<void> {
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
 * A pending message the producer is holding on to
 */
interface IPendingMessage {
    // The deferred is used to resolve a promise once the message is sent
    deferred: Deferred<any>;

    // The message to send
    message: string;
}

/**
 * Wrapper around a kafka producer that reconnects when the connection is lost
 */
export class Producer {
    private messages: {[key: string]: IPendingMessage[]} = {};
    private client: any;
    private producer: any;
    private connecting = false;
    private connected = false;
    private sendPending = false;

    constructor(private endpoint: string, private topic: string) {
        this.connect();
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
        const deferred = new Deferred<any>();
        pending.push({ deferred, message });

        // Mark the need to send a message
        this.requestSend();

        return deferred.promise;
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
        let count = 0;

        // tslint:disable-next-line:forin
        for (const key in this.messages) {
            this.sendMessages(key, this.messages[key]);
            count += this.messages[key].length;
        }

        this.messages = {};
    }

    /**
     * Sends a single message to Kafka
     */
    private sendMessages(key: string, pendingMessages: IPendingMessage[]) {
        const messages = pendingMessages.map((message) => 
        {
            return {value: message.message, key: key};
        });
        this.producer.produce(messages, (error, data) => {
                if (error) {
                    pendingMessages.forEach((message) => message.deferred.reject(error));
                } else {
                    pendingMessages.forEach((message) => message.deferred.resolve(data));
                }
            });
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
        this.client = new kafka({ 'url': this.endpoint });
        this.producer = this.client.topic(this.topic);

        this.connected = true;
        this.connecting = false;
        this.sendPendingMessages();
    }
}

/**
 * Commit offsets using REST client directly.
 */
export function commitOffset(client: any, path: string, commitRequest: any): Promise<void> {
    return new Promise<any>((resolve, reject) => {
        client.post(path + '/offsets', commitRequest, null, (err, data) => {
            if (err) {
                reject(err);
            } else {
                resolve(JSON.stringify(data));
            }
        });
    });
}

