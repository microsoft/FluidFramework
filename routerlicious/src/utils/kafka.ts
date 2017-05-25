import * as kafka from "kafka-node";
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
                    console.error(error);
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
    message: any;
}

/**
 * Wrapper around a kafka producer that reconnects when the connection is lost
 */
export class Producer {
    private messages: IPendingMessage[] = [];
    private client: kafka.Client;
    private producer: kafka.Producer;
    private connecting = false;
    private connected = false;

    constructor(private endpoint: string, private clientId: string, private topics: string[]) {
        this.connect();
    }

    /**
     * Sends the provided message to Kafka
     */
    public send(message: any): Promise<any> {
        const deferred = new Deferred<any>();
        if (!this.connected) {
            this.messages.push({ deferred, message });
        } else {
            this.sendMessage(message, deferred);
        }
        return deferred.promise;
    }

    /**
     * Sends all pending messages
     */
    private sendPendingMessages() {
        for (const message of this.messages) {
            this.sendMessage(message.message, message.deferred);
        }
        this.messages = [];
    }

    /**
     * Sends a single message to Kafka
     */
    private sendMessage(message: any, deferred: Deferred<any>) {
        this.producer.send(message, (error, data) => {
                if (error) {
                    deferred.reject(error);
                } else {
                    deferred.resolve(data);
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
        this.client = new kafka.Client(this.endpoint, this.clientId);
        this.producer = new kafka.Producer(this.client, { partitionerType: 3 });

        this.producer.on("ready", () => {
            ensureTopics(this.client, this.topics).then(
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
                    console.error(closeError);
                }
            });
            this.client = undefined;
        }

        this.connecting = this.connected = false;
        console.error("Kafka error - attempting reconnect");
        console.error(error);
        this.connect();
    }
}
