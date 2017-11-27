import { EventEmitter } from "events";
import * as core from "../../core";
import * as utils from "../../utils";

export interface IKafkaMessage {
    offset: number;
    value: Buffer;
}

class TestConsumer implements utils.kafkaConsumer.IConsumer {
    private emitter = new EventEmitter();
    private pausedQueue: string[] = null;
    private offset: number;

    constructor(public groupId: string, public topic: string) {
    }

    public async commitOffset(data: any): Promise<void> {
        this.offset = data.offset;
    }

    public on(event: string, listener: Function): this {
        this.emitter.on(event, listener as (...args: any[]) => void);
        return this;
    }

    public close(): Promise<void> {
        return Promise.resolve();
    }

    public pause() {
        if (!this.pausedQueue) {
            this.pausedQueue = [];
        }
    }

    public resume() {
        if (!this.pausedQueue) {
            return;
        }

        const pendingMessages = this.pausedQueue;
        this.pausedQueue = null;

        for (const message of pendingMessages) {
            this.emit(message);
        }
    }

    public emit(message: any) {
        if (this.pausedQueue) {
            this.pausedQueue.push(message);
        } else {
            this.emitter.emit("data", message);
        }
    }
}

class TestProducer implements utils.kafkaProducer.IProducer {
    constructor(private kafka: TestKafka) {
    }

    public send(message: string, key: string): Promise<any> {
        this.kafka.addMessage(message);
        return Promise.resolve();
    }

    public close(): Promise<void> {
        return Promise.resolve();
    }
}

/**
 * Test Kafka implementation. Allows for the creation of a joined producer/consumer pair.
 */
export class TestKafka {
    private messages: IKafkaMessage[] = [];
    private offset = 0;
    private consumers: TestConsumer[] = [];

    public createProducer(): utils.kafkaProducer.IProducer {
        return new TestProducer(this);
    }

    public createConsumer(): utils.kafkaConsumer.IConsumer {
        const consumer = new TestConsumer("test", "test");
        this.consumers.push(consumer);

        return consumer;
    }

    public getRawMessages(): IKafkaMessage[] {
        return this.messages;
    }

    public addMessage(message: string) {
        const storedMessage = {
            offset: this.offset++,
            value: Buffer.from(message),
        };
        this.messages.push(storedMessage);

        for (const consumer of this.consumers) {
            consumer.emit(storedMessage);
        }
    }

    public getLastMessage(): core.ISequencedOperationMessage {
        return this.getMessage(this.messages.length - 1);
    }

    public getMessage(index: number): core.ISequencedOperationMessage {
        return JSON.parse(this.messages[index].value.toString()) as core.ISequencedOperationMessage;
    }
}
