/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { Deferred } from "@fluidframework/common-utils";

export interface IQueuedMessage {
    topic: string;
    partition: number;
    offset: number;
    value: string | any;
}

export interface IPartition {
    topic: string;
    partition: number;
    offset: number;
}

export interface IPartitionWithEpoch extends IPartition {
    leaderEpoch: number;
}

export interface IConsumer {
    readonly groupId: string;

    readonly topic: string;

    /**
     * Commits consumer checkpoint offset.
     */
    commitCheckpoint(partitionId: number, queuedMessage: IQueuedMessage): Promise<void>;

    /**
     * Event Handler.
     */
    on(event: "connected", listener: () => void): this;
    on(event: "data", listener: (message: IQueuedMessage) => void): this;
    on(event: "rebalancing", listener: (partitions: IPartition[]) => void): this;
    on(event: "rebalanced", listener: (partitions: IPartitionWithEpoch[]) => void): this;
    on(event: string, listener: (...args: any[]) => void): this;

    /**
     * Closes the consumer.
     */
    close(): Promise<void>;

    /**
     * Pauses retrieval of new messages
     */
    pause(): Promise<void>;

    /**
     * Resumes retrival of messages
     */
    resume(): Promise<void>;
}

/**
 * A pending message the producer is holding on to
 */
export interface IPendingMessage {
    // The deferred is used to resolve a promise once the message is sent
    deferred: Deferred<any>;

    // The message to send
    message: string;
}

export interface IProducer {
    /**
     * Sends the message to a queue
     */
    send(messages: object[], tenantId: string, documentId: string): Promise<void>;

    /**
     * Closes the underlying connection
     */
    close(): Promise<void>;

    /**
     * Event handlers
     */
    on(event: "connected" | "disconnected" | "produced" | "throttled" | "error",
        listener: (...args: any[]) => void): this;
    once(event: "connected" | "disconnected" | "produced" | "throttled" | "error",
        listener: (...args: any[]) => void): this;
}

export interface IPendingBoxcar {
    documentId: string;
    tenantId: string;
    deferred: Deferred<void>;
    messages: any[];
}
