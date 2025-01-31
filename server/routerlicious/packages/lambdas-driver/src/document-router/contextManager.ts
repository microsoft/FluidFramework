/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "assert";
import { EventEmitter } from "events";
import {
	IContext,
	IContextErrorData,
	IQueuedMessage,
	IRoutingKey,
} from "@fluidframework/server-services-core";
import { Lumberjack } from "@fluidframework/server-services-telemetry";
import { DocumentContext } from "./documentContext";

const LastCheckpointedOffset: IQueuedMessage = {
	offset: -1,
	partition: -1,
	topic: "",
	value: undefined,
};

/**
 * The DocumentContextManager manages a set of created DocumentContexts and computes an aggregate checkpoint offset
 * from them.
 */
export class DocumentContextManager extends EventEmitter {
	private readonly contexts: Set<DocumentContext> = new Set();

	// Head and tail represent our processing position of the queue. Head is the latest message seen and
	// tail is the last message processed
	private head = LastCheckpointedOffset;
	private tail = LastCheckpointedOffset;

	// Offset represents the last offset checkpointed
	private lastCheckpoint = LastCheckpointedOffset;

	private closed = false;

	private headUpdatedAfterResume = true; // used to track whether the head has been updated after a pause/resume event, so that we allow moving out of order only once during resume.
	private tailUpdatedAfterResume = true; // used to track whether the tail has been updated after a pause/resume event, so that we allow moving out of order only once during resume.

	constructor(private readonly partitionContext: IContext) {
		super();
	}

	/**
	 * Creates a context that should be used for a single document partition
	 * This class is responsible for the lifetime of the context
	 */
	public createContext(routingKey: IRoutingKey, head: IQueuedMessage): DocumentContext {
		// Contexts should only be created within the processing range of the manager
		assert(head.offset > this.tail.offset && head.offset <= this.head.offset);

		// Create the new context and register for listeners on it
		const context = new DocumentContext(
			routingKey,
			head,
			this.partitionContext.log,
			() => this.tail,
		);
		this.contexts.add(context);
		context.addListener("checkpoint", (restartOnCheckpointFailure?: boolean) =>
			this.updateCheckpoint(restartOnCheckpointFailure),
		);
		context.addListener("error", (error, errorData: IContextErrorData) => {
			Lumberjack.verbose("Emitting error from contextManager, context error event.");
			this.emit("error", error, errorData);
		});
		context.addListener("pause", (offset?: number, reason?: any) => {
			// Find the lowest offset of all contexts' tail (checkpointed offset) and emit pause at that offset to ensure we dont miss any messages
			let lowestOffset = offset ?? Number.MAX_SAFE_INTEGER;
			for (const docContext of this.contexts) {
				if (docContext.tail.offset < lowestOffset) {
					lowestOffset = docContext.tail.offset;
				}
				docContext.setStateToPause(); // set headUpdatedAfterResume to false for all doc partitions, so that we allow their head to move backwards during resume
			}
			lowestOffset = lowestOffset > -1 ? lowestOffset : 0;
			this.headUpdatedAfterResume = false; // reset this flag when we pause
			this.tailUpdatedAfterResume = false; // reset this flag when we pause
			Lumberjack.info("Emitting pause from contextManager", { lowestOffset, offset, reason });
			this.emit("pause", lowestOffset, reason);
		});
		context.addListener("resume", () => {
			this.emit("resume");
		});
		return context;
	}

	public removeContext(context: DocumentContext): void {
		context.close();
		this.contexts.delete(context);
	}

	public getHeadOffset() {
		return this.head.offset;
	}

	/**
	 * Updates the head to the new offset. The head offset will not be updated if it stays the same or moves backwards, unless headUpdatedAfterResume is false.
	 * @returns True if the head was updated, false if it was not.
	 */
	public setHead(head: IQueuedMessage) {
		if (head.offset > this.head.offset || !this.headUpdatedAfterResume) {
			// If head is moving backwards
			if (head.offset <= this.head.offset) {
				if (head.offset <= this.lastCheckpoint.offset) {
					Lumberjack.info(
						"Not updating contextManager head since new head's offset is <= last checkpoint, returning early",
						{
							newHeadOffset: head.offset,
							currentHeadOffset: this.head.offset,
							lastCheckpointOffset: this.lastCheckpoint.offset,
						},
					);
					return false;
				}

				// allow moving backwards
				Lumberjack.info(
					"Allowing the contextManager head to move backwards to the specified offset",
					{
						newHeadOffset: head.offset,
						currentHeadOffset: this.head.offset,
						headUpdatedAfterResume: this.headUpdatedAfterResume,
					},
				);

				// if head goes lower than the current tail, we need to update the tail accordingly since it will be an invalid state
				if (head.offset < this.tail.offset) {
					Lumberjack.info("contextManager.setHead: updating tail offset because it is greater than the new head offset", {
						newHeadOffset: head.offset,
						currentHeadOffset: this.head.offset,
						currentTailOffset: this.tail.offset,
					});
					this.tail = head;
				}
			}

			if (!this.headUpdatedAfterResume) {
				Lumberjack.info("Setting headUpdatedAfterResume to true", {
					newHeadOffset: head.offset,
					currentHeadOffset: this.head.offset,
				});
				this.headUpdatedAfterResume = true;
			}

			this.head = head;
			return true;
		}

		return false;
	}

	public setTail(tail: IQueuedMessage) {
		assert(
			(tail.offset > this.tail.offset || !this.tailUpdatedAfterResume) &&
				tail.offset <= this.head.offset,
			`Tail offset ${tail.offset} must be greater than the current tail offset ${this.tail.offset} or tailUpdatedAfterResume should be false (${this.tailUpdatedAfterResume}), and less than or equal to the head offset ${this.head.offset}.`,
		);

		if (tail.offset <= this.tail.offset) {
			Lumberjack.info(
				"Allowing the contextManager tail to move backwards to the specified offset",
				{
					newTailOffset: tail.offset,
					currentTailOffset: this.tail.offset,
					tailUpdatedAfterResume: this.tailUpdatedAfterResume,
				},
			);
		}

		if (!this.tailUpdatedAfterResume) {
			Lumberjack.info("Setting tailUpdatedAfterResume to true", {
				newTailOffset: tail.offset,
				currentTailOffset: this.tail.offset,
			});
			this.tailUpdatedAfterResume = true;
		}

		this.tail = tail;
		this.updateCheckpoint();
	}

	public close() {
		this.closed = true;

		for (const context of this.contexts) {
			context.close();
		}

		this.contexts.clear();

		this.removeAllListeners();
	}

	private updateCheckpoint(restartOnCheckpointFailure?: boolean) {
		if (this.closed) {
			return;
		}

		// Set the starting offset at the tail. Contexts can then lower that offset based on their positions.
		let queuedMessage = this.tail;

		for (const context of this.contexts) {
			// Utilize the tail of the context if there is still pending work.
			// If there isn't pending work then we are fully caught up.
			if (context.hasPendingWork()) {
				// Lower the offset when possible
				queuedMessage =
					queuedMessage.offset > context.tail.offset ? context.tail : queuedMessage;
			}
		}

		// Checkpoint once the offset has changed
		if (queuedMessage.offset !== this.lastCheckpoint.offset) {
			this.partitionContext.checkpoint(queuedMessage, restartOnCheckpointFailure);
			this.lastCheckpoint = queuedMessage;
		}
	}
}
