/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "assert";
import { EventEmitter } from "events";
import {
	IContext,
	IQueuedMessage,
	ILogger,
	IContextErrorData,
	IRoutingKey,
} from "@fluidframework/server-services-core";
import { getLumberBaseProperties, Lumberjack } from "@fluidframework/server-services-telemetry";

export class DocumentContext extends EventEmitter implements IContext {
	// We track two offsets - head and tail. Head represents the largest offset related to this document we
	// have seen. Tail represents the last checkpointed offset. When head and tail match we have fully checkpointed
	// the document.
	private headInternal: IQueuedMessage;
	private tailInternal: IQueuedMessage;
	private firstTest: boolean;

	private closed = false;
	private contextError = undefined;

	constructor(
		private readonly routingKey: IRoutingKey,
		head: IQueuedMessage,
		public readonly log: ILogger | undefined,
		private readonly getLatestTail: () => IQueuedMessage,
	) {
		super();

		// Head represents the largest offset related to the document that is not checkpointed.
		// Tail will be set to the checkpoint offset of the previous head
		this.headInternal = head;
		this.tailInternal = this.getLatestTail();
		this.firstTest = true;
	}

	public get head(): IQueuedMessage {
		return this.headInternal;
	}

	public get tail(): IQueuedMessage {
		return this.tailInternal;
	}

	/**
	 * Returns whether or not there is pending work in flight - i.e. the head and tail are not equal
	 */
	public hasPendingWork(): boolean {
		return this.headInternal !== this.tailInternal;
	}

	/**
	 * Updates the head offset for the context.
	 */
	public setHead(head: IQueuedMessage) {
		assert(
			head.offset > this.head.offset,
			`${head.offset} > ${this.head.offset} ` +
				`(${head.topic}, ${head.partition}, ${this.routingKey.tenantId}/${this.routingKey.documentId})`,
		);

		// When moving back to a state where head and tail differ we set the tail to be the old head, as in the
		// constructor, to make tail represent the inclusive top end of the checkpoint range.
		if (!this.hasPendingWork()) {
			this.tailInternal = this.getLatestTail();
		}

		this.headInternal = head;
	}

	public checkpoint(message: IQueuedMessage, restartOnCheckpointFailure?: boolean) {
		if (this.closed) {
			return;
		}

		// Assert offset is between the current tail and head
		const offset = message.offset;

		// let offset = message.offset;
		if (this.firstTest) {
			this.tail.offset = this.head.offset;
			// offset = offset-1;
			this.firstTest = false;
		}

		try {
			console.log(`*********`);
			console.log(`Tail: ${this.tail.offset}, Offset: ${offset}, Head: ${this.head.offset}`);
			console.log(`*********`);
			assert(
				offset > this.tail.offset && offset <= this.head.offset,
				`${offset} > ${this.tail.offset} && ${offset} <= ${this.head.offset} ` +
					`(${message.topic}, ${message.partition}, ${this.routingKey.tenantId}/${this.routingKey.documentId})`,
			);

			// Update the tail and broadcast the checkpoint
			this.tailInternal = message;
			console.log(`*******EMIT HERE*********`);
			this.emit("checkpoint", restartOnCheckpointFailure);
		} catch (error) {
			console.log(`*******ERROR*********`);
			// Mark the document as corrupted
			const documentId = this.routingKey.documentId;
			const tenantId = this.routingKey.tenantId;
			// Update the tail
			this.tailInternal = message;
			const properties = {
				...getLumberBaseProperties(documentId, tenantId),
				messageOffset: message.offset,
				headOffset: this.head.offset,
				tailOffset: this.tail.offset,
				topic: message.topic,
				partition: message.partition,
			};
			Lumberjack.error(
				`Skipping checkpoint and marking document as corrupted. Message offset is not between the current tail and head offsets.`,
				properties,
				error,
			);
			// we emit the error last
			this.error(error, {
				restart: false,
				markAsCorrupt: message,
				skipCheckpoint: true,
				documentId,
				tenantId,
			});
		}
	}

	public error(error: any, errorData: IContextErrorData) {
		this.contextError = error;
		this.emit("error", error, errorData);
	}

	public close() {
		this.closed = true;

		this.removeAllListeners();
	}

	public getContextError() {
		return this.contextError;
	}
}
