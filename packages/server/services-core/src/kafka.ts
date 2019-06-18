/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as utils from "@prague/utils";

export interface IKafkaMessage {
    topic: string;
    value: string | any;
    offset: number;
    partition: number;
    highWaterOffset: number;
    key: string;
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
    commitOffset(data: any[]): Promise<void>;

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
    pause();

    /**
     * Resumes retrival of messages
     */
    resume();
}

/**
 * A pending message the producer is holding on to
 */
export interface IPendingMessage {
    // The deferred is used to resolve a promise once the message is sent
    deferred: utils.Deferred<any>;

    // The message to send
    message: string;
}

export interface IProducer {
    /**
     * Sends the message to kafka
     */
    send(message: object, tenantId: string, documentId: string): Promise<any>;

    /**
     * Closes the underlying connection
     */
    close(): Promise<void>;
}

export interface IPendingBoxcar {
    documentId: string;
    tenantId: string;
    deferred: utils.Deferred<void>;
    messages: any[];
}
