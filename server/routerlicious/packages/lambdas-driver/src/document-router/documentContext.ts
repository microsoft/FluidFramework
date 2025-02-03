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

	private lastSuccessfulOffsetInternal: number;

	private closed = false;
	private contextError = undefined;

	// Below flag is used to track whether head has been updated after a pause/resume event.
	// This is to allow moving out of order once during resume.
	// Value = true means it is in a paused state and waiting to be updated during resume.
	public headPaused = false;

	constructor(
		private readonly routingKey: IRoutingKey,
		head: IQueuedMessage,
		public readonly log: ILogger | undefined,
		private readonly getLatestTail: () => IQueuedMessage,
		private readonly getContextManagerPauseState: () => {
			headPaused: boolean;
			tailPaused: boolean;
		},
	) {
		super();

		// Head represents the largest offset related to the document that is not checkpointed.
		// Tail will be set to the checkpoint offset of the previous head
		this.headInternal = head;
		this.tailInternal = this.getLatestTail();
		this.lastSuccessfulOffsetInternal = this.tailInternal.offset; // will be -1 at creation
	}

	public get head(): IQueuedMessage {
		return this.headInternal;
	}

	public get tail(): IQueuedMessage {
		return this.tailInternal;
	}

	public get lastSuccessfulOffset(): number {
		return this.lastSuccessfulOffsetInternal;
	}

	/**
	 * Returns whether or not there is pending work in flight - i.e. the head and tail are not equal
	 */
	public hasPendingWork(): boolean {
		return this.headInternal !== this.tailInternal;
	}

	/**
	 * Sets the last successfully processed offset.
	 */
	public setLastSuccessfulOffset(offset: number) {
		this.lastSuccessfulOffsetInternal = offset;
	}

	/**
	 * Sets the state to pause, i.e. headPaused = true.
	 */
	public setStateToPause() {
		this.headPaused = true;
	}

	/**
	 * Updates the head offset for the context.
	 */
	public setHead(head: IQueuedMessage) {
		assert(
			head.offset > this.head.offset || this.headPaused,
			`Head offset ${head.offset} must be greater than the current head offset ${this.head.offset} or headPaused should be true (${this.headPaused}). Topic ${head.topic}, partition ${head.partition}, tenantId ${this.routingKey.tenantId}, documentId ${this.routingKey.documentId}.`,
		);

		// If head is moving backwards
		if (head.offset <= this.head.offset) {
			if (head.offset <= this.tail.offset) {
				Lumberjack.info(
					"Not updating documentContext head since new head's offset is <= last checkpoint offset (tail), returning early",
					{
						newHeadOffset: head.offset,
						currentHeadOffset: this.head.offset,
						currentTailOffset: this.tail.offset,
						documentId: this.routingKey.documentId,
					},
				);
				return false;
			}

			// allow moving backwards
			Lumberjack.info(
				"Allowing the document context head to move backwards to the specified offset",
				{
					newHeadOffset: head.offset,
					currentHeadOffset: this.head.offset,
					currentTailOffset: this.tail.offset,
					headPaused: this.headPaused,
					documentId: this.routingKey.documentId,
				},
			);
		}

		// When moving back to a state where head and tail differ we set the tail to be the old head, as in the
		// constructor, to make tail represent the inclusive top end of the checkpoint range.
		if (!this.hasPendingWork()) {
			this.tailInternal = this.getLatestTail();
		}

		if (this.headPaused) {
			Lumberjack.info("Setting headPaused to false", {
				newHeadOffset: head.offset,
				currentHeadOffset: this.head.offset,
				currentTailOffset: this.tail.offset,
				documentId: this.routingKey.documentId,
			});
			this.headPaused = false;
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

		const contextManagerPauseState = this.getContextManagerPauseState();
		if (!contextManagerPauseState.headPaused && !contextManagerPauseState.tailPaused) {
			assert(
				offset > this.tail.offset && offset <= this.head.offset,
				`Checkpoint offset ${offset} must be greater than the current tail offset ${this.tail.offset} and less than or equal to the head offset ${this.head.offset}. Topic ${message.topic}, partition ${message.partition}, tenantId ${this.routingKey.tenantId}, documentId ${this.routingKey.documentId}.`,
			);
		} else if (contextManagerPauseState.tailPaused) {
			// means that tail is pending to be updated after resume, so it might be having an invalid value currently
			assert(
				offset === this.head.offset,
				`Checkpoint offset ${offset} must be equal to the head offset ${this.head.offset}. Topic ${message.topic}, partition ${message.partition}, tenantId ${this.routingKey.tenantId}, documentId ${this.routingKey.documentId}.`,
			);
		}

		// Update the tail and broadcast the checkpoint
		this.tailInternal = message;
		this.emit("checkpoint", restartOnCheckpointFailure);
	}

	public error(error: any, errorData: IContextErrorData) {
		if (this.closed) {
			// don't emit errors after closing
			Lumberjack.info("Skipping emitting error since the documentContext is already closed", {
				documentId: this.routingKey.documentId,
				tenantId: this.routingKey.tenantId,
			});
			return;
		}
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

	public pause(offset?: number, reason?: any) {
		this.headPaused = true;
		this.emit("pause", offset, reason);
	}

	public resume() {
		this.emit("resume");
	}
}
