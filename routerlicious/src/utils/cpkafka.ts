import * as kafka from "kafka-rest";
import { Deferred } from "./promises";

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
export class CPProducer {
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
        // TODO we may wish to store the pending message direclty in an array to avoid the below map
        const messages = pendingMessages.map((message) => {return {value: message.message, key: key} });
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

export class CPConsumer {
    private stream: any;
    private client: any;
    private connected = false;
    private connecting = false;
    
    constructor(private groupId: string, private endpoint: string, private topic: string) {
        this.connect();
    }

    private connect(): Promise<void> {
        if (this.connected || this.connecting) {
            return;
        }
        this.connecting = true;
        return new Promise<void>((resolve, reject) => {
            this.client = new kafka({ 'url': this.endpoint });
            this.client.consumer(this.groupId).join({
                "auto.offset.reset": "smallest"
            }, (error, instance) => {
                if (error) {
                    this.handleError(error);
                } else {
                    this.connected = true;
                    this.connecting = false;
                    this.stream = instance.subscribe(this.topic);
                    return resolve();
                }
            });
        });
    }

    private handleError(error: any) {
        if (this.client) {
            this.client = undefined;
        }
        this.connected = this.connecting = false;
        console.error("Kafka consumer error - attempting reconnect");
        console.error(error);
        this.connect();
    }

}
