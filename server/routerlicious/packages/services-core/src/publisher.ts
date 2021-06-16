/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * A topic where messages can be published
 */
export interface ITopic {
    /**
     * Emits an event to the topic
     */
    emit(event: string, ...args: any[]);
}

/**
 * Basic interface used to publish messages to a topic
 */
export interface IPublisher<T = any> {
    /**
     * Subscribe to events about the publisher
     */
    on(event: string, listener: (...args: any[]) => void);

    /**
     * Used to send messages to a topic
     */
    to(topic: string): ITopic;

    /**
     * Used to emit an event to a topic
     * This will be used in place of "to().emit()" when defined
     */
    emit?(topic: string, event: string, ...args: any[]): Promise<void>;

    /**
     * Used to emit a batch to a topic
     * This will be used in place of "to().emit()" & "emit()" when defined
     */
    emitBatch?(topic: string, batch: IMessageBatch<T>): Promise<void>;

    /**
     * Closes the publisher
     */
    close(): Promise<void>;
}

export interface IMessageBatch<T> {
    /**
     * Tenant id for the batch
     */
    tenantId: string;

    /**
     * Document id for the batch
     */
    documentId: string;

    /**
     * Event name (topic)
     */
    event: string;

    /**
     * List of messages
     */
    messages: T[];
}
