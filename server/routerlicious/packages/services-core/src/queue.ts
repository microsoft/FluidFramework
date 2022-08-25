/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Deferred } from "@fluidframework/common-utils";
import { ITicketedMessage } from "./messages";

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
     * Returns true if the consumer is connected
     */
    isConnected(): boolean;

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

    /**
     * Commits consumer checkpoint offset.
     */
    commitCheckpoint(partitionId: number, queuedMessage: IQueuedMessage): Promise<void>;

    /**
     * Returns the offset of the latest consumsed message
     * May return undefined if a consumer is not tracking this
     */
    getLatestMessageOffset(partitionId: number): number | undefined;

    /**
     * Event handlers
     */
    on(event: "connected" | "disconnected" | "closed" | "paused" | "resumed", listener: () => void): this;
    on(event: "data", listener: (message: IQueuedMessage) => void): this;
    on(event: "rebalancing", listener: (partitions: IPartition[]) => void): this;
    on(event: "rebalanced", listener: (partitions: IPartitionWithEpoch[]) => void): this;
    on(event: string, listener: (...args: any[]) => void): this;
    once(event: "connected" | "disconnected" | "closed" | "paused" | "resumed", listener: () => void): this;
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

export interface IProducer<T = ITicketedMessage> {
    /**
     * Returns true if the producer is connected
     */
    isConnected(): boolean;

    /**
     * Sends the message to a queue
     * @param partitionId - Specify this to send the messages to a specific partition. Only RdkafkaProducer supports
     * this.
     */
    send(messages: T[], tenantId: string, documentId: string, partitionId?: number): Promise<void>;

    /**
     * Closes the underlying connection
     */
    close(): Promise<void>;

    /**
     * Event handlers
     */
    on(event: "connected" | "disconnected" | "closed" | "produced" | "throttled" | "error",
        listener: (...args: any[]) => void): this;
    once(event: "connected" | "disconnected" | "closed" | "produced" | "throttled" | "error",
        listener: (...args: any[]) => void): this;
}

export interface IPendingBoxcar {
    documentId: string;
    tenantId: string;
    deferred: Deferred<void>;
    messages: any[];
    partitionId?: number;
}
