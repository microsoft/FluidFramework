import * as kafkaNode from "kafka-node";
import * as kafkaRest from "kafka-rest";
import { debug } from "./debug";
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
 * Base producer responsible for batching and sending.
 */
export class Producer {
    protected messages: {[key: string]: IPendingMessage[]} = {};
    protected client: any;
    protected producer: any;
    protected connecting = false;
    protected connected = false;
    private sendPending = false;
    protected batchProducer: (key: string, messages: IPendingMessage[]) => void;

    /**
     * Push messages locally and request send.
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
            this.batchProducer(key, this.messages[key]);
            count += this.messages[key].length;
        }
        this.messages = {};
    }
}

/**
 * Kafka-Rest Producer.
 */
class KafkaRestProducer extends Producer implements IProdcuer {

    constructor(private endpoint: string, private topic: string) {
        super();
        this.connect();
        this.initBatchProducer();
    }

    /**
     * Sends the provided message to Kafka
     */
    public send(message: string, key: string): Promise<any> {
        return this.sendMessage(message, key);
    }

    /**
     * Implements batch producer through kafka-rest.
     */
    private initBatchProducer() {
        this.batchProducer = function(key: string, pendingMessages: IPendingMessage[]) {
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
     * Creates a connection to Kafka.
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

/**
 * Kafka-Node Producer.
 */
class KafkaNodeProducer extends Producer implements IProdcuer {

    constructor(private endpoint: string, private clientId: string, private topic: string) {
        super();
        this.connect();
        this.initBatchProducer();
    }

    /**
     * Sends the provided message to Kafka
     */
    public send(message: string, key: string): Promise<any> {
        return this.sendMessage(message, key);
    }

    /**
     * Implements batch producer through kafka-rest.
     */
    private initBatchProducer() {
        this.batchProducer = function(key: string, pendingMessages: IPendingMessage[]) {
            const messages = pendingMessages.map((message) => message.message);
            const kafkaMessage = [{ topic: this.topic, messages, key }];
            this.producer.send(kafkaMessage, (error, data) => {
                    if (error) {
                        pendingMessages.forEach((message) => message.deferred.reject(error));
                    } else {
                        pendingMessages.forEach((message) => message.deferred.resolve(data));
                    }
            });
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

        (<any> this.client).on("error", (error) => {
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
                (error, data) => {
                    if (error) {
                        debug(error);
                        return reject();
                    }

                    return resolve();
                });
        });
    }
}

export function create(type: string, endPoint: string, clientId: string, topic: string) : IProdcuer{
    return type === "kafka-rest" ? new KafkaRestProducer(endPoint, topic)
                                 : new KafkaNodeProducer(endPoint, clientId, topic);
}

