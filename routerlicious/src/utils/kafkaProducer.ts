// import * as kafkaNode from "kafka-node";
import * as kafkaRest from "kafka-rest";
// import { debug } from "./debug";
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

export interface IProdcuer {
    /**
     * Sends the message to kafka
     */
    send(message: string, key: string): Promise<any>;
}


/**
 * Wrapper around a kafka producer that reconnects when the connection is lost
 */
export class Producer {
    protected messages: {[key: string]: IPendingMessage[]} = {};
    protected client: any;
    protected producer: any;
    protected connecting = false;
    protected connected = false;
    protected sendPending = false;
    protected sendMessages: (key: string, messages: IPendingMessage[]) => void;

    /**
     * Sends the provided message to Kafka
     */
    protected sendMessage(message: string, key: string): Promise<any> {
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
    protected sendPendingMessages() {
        let count = 0;

        // tslint:disable-next-line:forin
        for (const key in this.messages) {
            this.sendMessages(key, this.messages[key]);
            count += this.messages[key].length;
        }

        this.messages = {};
    }

}

class KafkaRestProducer extends Producer implements IProdcuer {

    constructor(private endpoint: string, private topic: string) {
        super();
        this.connect();
        this.sendMessages = function(key: string, pendingMessages: IPendingMessage[]) {
            const messages = pendingMessages.map((message) => {
                return {value: message.message, key};
            });
            this.producer.produce(messages, (error, data) => {
                    if (error) {
                        pendingMessages.forEach((message) => message.deferred.reject(error));
                    } else {
                        pendingMessages.forEach((message) => message.deferred.resolve(data));
                    }
            });
        }
    }

    /**
     * Sends the provided message to Kafka
     */
    public send(message: string, key: string): Promise<any> {
        return this.sendMessage(message, key);
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
        this.client = new kafkaRest({ url: this.endpoint });
        this.producer = this.client.topic(this.topic);

        this.connected = true;
        this.connecting = false;
        this.sendPendingMessages();
    }
}

export function create(type: string, endPoint: string, topic: string) : IProdcuer{
    return new KafkaRestProducer(endPoint, topic);
}

