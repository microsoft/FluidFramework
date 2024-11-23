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
import { Lumberjack } from "@fluidframework/server-services-telemetry";

/**
 * @internal
 */
export class DocumentContext extends EventEmitter implements IContext {
	// We track two offsets - head and tail. Head represents the largest offset related to this document we
	// have seen. Tail represents the last checkpointed offset. When head and tail match we have fully checkpointed
	// the document.
	private headInternal: IQueuedMessage;
	private tailInternal: IQueuedMessage;

	private closed = false;
	private contextError = undefined;

	public headUpdatedAfterResume = false; // used to track whether the head has been updated after a resume event, so that we allow moving out of order only once during resume.

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
	public setHead(head: IQueuedMessage, resumeBackToOffset?: number | undefined) {
		assert(
			head.offset > this.head.offset ||
				(head.offset === resumeBackToOffset && !this.headUpdatedAfterResume),
			`Head offset ${head.offset} must be greater than the current head offset ${this.head.offset} or equal to the resume offset ${resumeBackToOffset} if not yet resumed (headUpdatedAfterResume: ${this.headUpdatedAfterResume}). Topic ${head.topic}, partition ${head.partition}, tenantId ${this.routingKey.tenantId}, documentId ${this.routingKey.documentId}.`,
		);

		// If head is moving backwards
		if (head.offset <= this.head.offset) {
			if (head.offset <= this.tailInternal.offset) {
				Lumberjack.info(
					"Not updating documentContext head since new head's offset is <= last checkpoint offset (tailInternal), returning early",
					{
						newHeadOffset: head.offset,
						currentHeadOffset: this.head.offset,
						tailInternalOffset: this.tailInternal.offset,
						documentId: this.routingKey.documentId,
					},
				);
				return false;
			}
			Lumberjack.info("Allowing the document context head to move to the specified offset", {
				resumeBackToOffset,
				currentHeadOffset: this.head.offset,
				documentId: this.routingKey.documentId,
			});
		}

		// When moving back to a state where head and tail differ we set the tail to be the old head, as in the
		// constructor, to make tail represent the inclusive top end of the checkpoint range.
		if (!this.hasPendingWork()) {
			this.tailInternal = this.getLatestTail();
		}

		if (!this.headUpdatedAfterResume && resumeBackToOffset !== undefined) {
			Lumberjack.info("Setting headUpdatedAfterResume to true", {
				resumeBackToOffset,
				currentHeadOffset: this.head.offset,
				documentId: this.routingKey.documentId,
			});
			this.headUpdatedAfterResume = true;
		}

		this.headInternal = head;
		return true;
	}

	public checkpoint(message: IQueuedMessage, restartOnCheckpointFailure?: boolean) {
		if (this.closed) {
			return;
		}

		// Assert offset is between the current tail and head
		const offset = message.offset;

		assert(
			offset > this.tail.offset && offset <= this.head.offset,
			`Checkpoint offset ${offset} must be greater than the current tail offset ${this.tail.offset} and less than or equal to the head offset ${this.head.offset}. Topic ${message.topic}, partition ${message.partition}, tenantId ${this.routingKey.tenantId}, documentId ${this.routingKey.documentId}.`,
		);

		// Update the tail and broadcast the checkpoint
		this.tailInternal = message;
		this.emit("checkpoint", restartOnCheckpointFailure);
	}

	public error(error: any, errorData: IContextErrorData) {
		this.contextError = error;
		Lumberjack.verbose("Emitting error from documentContext");
		this.emit("error", error, errorData);
	}

	public close() {
		this.closed = true;

		this.removeAllListeners();
	}

	public getContextError() {
		return this.contextError;
	}

	public pause(offset: number, reason?: any) {
		this.headUpdatedAfterResume = false; // reset this flag when we pause
		this.emit("pause", offset, reason);
	}

	public resume() {
		this.emit("resume");
	}
}
