/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { EventEmitter } from "events";
import * as core from "@fluidframework/server-services-core";
import { TestContext } from "./testContext";

export class TestConsumer implements core.IConsumer {
    private readonly emitter = new EventEmitter();
    private pausedQueue: string[] = null;
    private failOnCommit = false;

    // Leverage the context code for storing and tracking an offset
    private readonly context = new TestContext();

    constructor(public groupId: string, public topic: string) {
    }

    public setFailOnCommit(value: boolean) {
        this.failOnCommit = value;
    }

    public isConnected() {
        return true;
    }

    public async commitCheckpoint(partitionId: number, queuedMessage: core.IQueuedMessage): Promise<void> {
        // For now we assume a single partition for the test consumer
        assert(partitionId === 0);

        if (this.failOnCommit) {
            return Promise.reject(new Error("TestConsumer set to fail on commit"));
        } else {
            this.context.checkpoint(queuedMessage);
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

    public once(event: string, listener: (...args: any[]) => void): this {
        this.emitter.once(event, listener as (...args: any[]) => void);
        return this;
    }

    // eslint-disable-next-line @typescript-eslint/promise-function-async
    public close(): Promise<void> {
        return Promise.resolve();
    }

    public async pause() {
        if (!this.pausedQueue) {
            this.pausedQueue = [];
        }
    }

    public async resume() {
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
    constructor(private readonly kafka: TestKafka) {
    }

    public isConnected() {
        return true;
    }

    // eslint-disable-next-line @typescript-eslint/ban-types, @typescript-eslint/promise-function-async
    public send(messages: object[], key: string): Promise<any> {
        for (const message of messages) {
            this.kafka.addMessage(message, key);
        }
        return Promise.resolve();
    }

    // eslint-disable-next-line @typescript-eslint/promise-function-async
    public close(): Promise<void> {
        return Promise.resolve();
    }

    public on(event: string, listener: (...args: any[]) => void): this {
        return this;
    }

    public once(event: string, listener: (...args: any[]) => void): this {
        return this;
    }
}

/**
 * Test Kafka implementation. Allows for the creation of a joined producer/consumer pair.
 */
export class TestKafka {
    public static createdQueuedMessage(offset: number, metadata?: any): core.IQueuedMessage {
        return {
            topic: "topic",
            partition: 0,
            offset,
            value: "",
        };
    }

    private readonly messages: core.IQueuedMessage[] = [];
    private offset = 0;
    private readonly consumers: TestConsumer[] = [];

    public createProducer(): TestProducer {
        return new TestProducer(this);
    }

    public createConsumer(): TestConsumer {
        const consumer = new TestConsumer("test", "test");
        this.consumers.push(consumer);

        return consumer;
    }

    public getRawMessages(): core.IQueuedMessage[] {
        return this.messages;
    }

    public addMessage(message: any, topic: string) {
        const offset = this.offset++;

        const queuedMessage = TestKafka.createdQueuedMessage(offset);
        queuedMessage.value = message;
        queuedMessage.topic = topic;

        this.messages.push(queuedMessage);

        for (const consumer of this.consumers) {
            consumer.emit(queuedMessage);
        }
    }

    public getLastMessage(): core.ISequencedOperationMessage {
        return this.getMessage(this.messages.length - 1);
    }

    public getMessage(index: number): core.ISequencedOperationMessage {
        return this.messages[index].value as core.ISequencedOperationMessage;
    }
}
