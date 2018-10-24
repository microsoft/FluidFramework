import * as kafkaRest from "kafka-rest";
import { IPendingMessage, IProducer } from "./definitions";
import { Producer } from "./producer";

/**
 * Kafka-Rest Producer.
 */
export class KafkaRestProducer extends Producer implements IProducer {
    private connecting = false;
    private connected = false;

    constructor(private endpoint: string, private topic: string, maxMessageSize: number) {
        super(maxMessageSize);
        this.connect();
    }

    public close(): Promise<void> {
        // TODO support close for rest client
        return Promise.resolve();
    }

    protected sendCore(key: string, pendingMessages: IPendingMessage[]) {
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

    protected canSend(): boolean {
        return this.connected;
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
