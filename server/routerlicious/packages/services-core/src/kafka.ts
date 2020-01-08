/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { Deferred } from "@microsoft/fluid-core-utils";

export interface IKafkaMessage extends ICheckpointOffset {
    topic: string;
    value: string | any;
    partition: number;
    highWaterOffset: number;
    key: string;
}

export interface ICheckpointOffset {
    offset: number;
    metadata?: any;
}

export interface IPartition {
    topic: string;
    partition: number;
    offset: number;
}

export interface IConsumer {
    groupId: string;

    topic: string;

    /**
     * Commits consumer offset.
     */
    commitOffset(partitionId: number, checkpointOffset: ICheckpointOffset): Promise<void>;

    /**
     * Event Handler.
     */
    on(event: "data", listener: (message: IKafkaMessage) => void): this;
    on(event: "rebalancing" | "rebalanced", listener: (partitions: IPartition[]) => void): this;
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
     * Sends the message to kafka
     */
    send(messages: object[], tenantId: string, documentId: string): Promise<any>;

    /**
     * Closes the underlying connection
     */
    close(): Promise<void>;

    /**
     * Error event Handler.
     */
    once(event: "producerError", listener: (...args: any[]) => void): this;
}

export interface IPendingBoxcar {
    documentId: string;
    tenantId: string;
    deferred: Deferred<void>;
    messages: any[];
}
