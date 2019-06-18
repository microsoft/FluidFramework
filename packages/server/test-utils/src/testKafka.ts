/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as core from "@prague/services-core";
import * as assert from "assert";
import { EventEmitter } from "events";
import { TestContext } from "./testContext";

export class TestConsumer implements core.IConsumer {
    private emitter = new EventEmitter();
    private pausedQueue: string[] = null;
    private failOnCommit = false;

    // Leverage the context code for storing and tracking an offset
    private context = new TestContext();

    constructor(public groupId: string, public topic: string) {
    }

    public setFailOnCommit(value: boolean) {
        this.failOnCommit = value;
    }

    public async commitOffset(data: any[]): Promise<void> {
        // For now we assume a single partition for the test consumer
        assert(data.length === 1 && data[0].partition === 0);

        if (this.failOnCommit) {
            return Promise.reject("TestConsumer set to fail on commit");
        } else {
            this.context.checkpoint(data[0].offset);
            return;
        }
    }

    public getOffset(): number {
        return this.context.offset;
    }

    public async waitForOffset(offset: number): Promise<void> {
        return this.context.waitForOffset(offset);
    }

    public on(event: string, listener: (...args: any[]) => void): this {
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

    /**
     * Manually signal an error
     */
    public emitError(error: any) {
        this.emitter.emit("error", error);
    }

    public emit(message: any) {
        if (this.pausedQueue) {
            this.pausedQueue.push(message);
        } else {
            this.emitter.emit("data", message);
        }
    }

    public rebalance() {
        this.emitter.emit("rebalancing");
        this.emitter.emit("rebalanced", [{ topic: this.topic, offset: 0, partition: 0 }]);
    }
}

export class TestProducer implements core.IProducer {
    constructor(private kafka: TestKafka) {
    }

    public send(message: object, key: string): Promise<any> {
        this.kafka.addMessage(message, key);
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
    private messages: core.IKafkaMessage[] = [];
    private offset = 0;
    private consumers: TestConsumer[] = [];

    public createProducer(): TestProducer {
        return new TestProducer(this);
    }

    public createConsumer(): TestConsumer {
        const consumer = new TestConsumer("test", "test");
        this.consumers.push(consumer);

        return consumer;
    }

    public getRawMessages(): core.IKafkaMessage[] {
        return this.messages;
    }

    public addMessage(message: any, topic: string) {
        const offset = this.offset++;
        const storedMessage: core.IKafkaMessage = {
            highWaterOffset: offset,
            key: null,
            offset,
            partition: 0,
            topic,
            value: message,
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
        return this.messages[index].value as core.ISequencedOperationMessage;
    }
}
