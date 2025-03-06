/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Deferred } from "@fluidframework/server-common-utils";

import { ITicketedMessage } from "./messages";

/**
 * @internal
 */
export interface IQueuedMessage {
	topic: string;
	partition: number;
	offset: number;
	value: string | any;
	timestamp?: number | undefined;
}

/**
 * @internal
 */
export interface IPartition {
	topic: string;
	partition: number;
	offset: number;
}

/**
 * @internal
 */
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
	 * Pauses retrieval of new messages without a rebalance, and seeks the offset to the specified value.
	 */
	pauseFetching?(partitionId: number, seekTimeout: number, offset?: number): Promise<void>;

	/**
	 * Resumes retrieval of messages without a rebalance.
	 */
	resumeFetching?(partitionId: number): Promise<void>;

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
	on(
		event: "connected" | "disconnected" | "closed" | "paused" | "resumed",
		listener: () => void,
	): this;
	on(event: "data", listener: (message: IQueuedMessage) => void): this;
	on(event: "rebalancing", listener: (partitions: IPartition[]) => void): this;
	on(event: "rebalanced", listener: (partitions: IPartition[]) => void): this;
	on(event: string, listener: (...args: any[]) => void): this;
	once(
		event: "connected" | "disconnected" | "closed" | "paused" | "resumed",
		listener: () => void,
	): this;
}

/**
 * A pending message the producer is holding on to
 * @internal
 */
export interface IPendingMessage {
	// The deferred is used to resolve a promise once the message is sent
	deferred: Deferred<any>;

	// The message to send
	message: string;
}

/**
 * @internal
 */
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
	on(
		event: "connected" | "disconnected" | "closed" | "produced" | "throttled" | "log" | "error",
		listener: (...args: any[]) => void,
	): this;
	once(
		event: "connected" | "disconnected" | "closed" | "produced" | "throttled" | "log" | "error",
		listener: (...args: any[]) => void,
	): this;
	off(
		event: "connected" | "disconnected" | "closed" | "produced" | "throttled" | "log" | "error",
		listener: (...args: any[]) => void,
	): this;
}

/**
 * @internal
 */
export interface IPendingBoxcar {
	documentId: string;
	tenantId: string;
	deferred: Deferred<void>;
	messages: any[];
	partitionId?: number;
}
