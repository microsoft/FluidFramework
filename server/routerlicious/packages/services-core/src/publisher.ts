/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
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
export interface IPublisher {
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
     * Closes the publisher
     */
    close(): Promise<void>;
}
