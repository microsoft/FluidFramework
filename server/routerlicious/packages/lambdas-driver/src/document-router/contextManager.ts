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

	// Below flags are used to track whether head/tail has been updated after a pause/resume event.
	// This is to allow moving out of order once during resume.
	// Value = true means they are in a paused state and are waiting to be updated during resume.
	private headPaused = false;
	private tailPaused = false;

	constructor(private readonly partitionContext: IContext) {
		super();
	}

	/**
	 * Creates a context that should be used for a single document partition
	 * This class is responsible for the lifetime of the context
	 */
	public createContext(routingKey: IRoutingKey, head: IQueuedMessage): DocumentContext {
		if (!this.headPaused && this.tailPaused) {
			// tail is resumed after head, so its possible to be in this state, but vice versa is not possible
			// this means that tail is pending to be updated after resume, so it might be having an invalid value currently
			assert(head.offset === this.head.offset);
		} else {
			// both head and tail are either paused or resumed
			// Contexts should only be created within the processing range of the manager
			assert(head.offset > this.tail.offset && head.offset <= this.head.offset);
		}

		// Create the new context and register for listeners on it
		const context = new DocumentContext(
			routingKey,
			head,
			this.partitionContext.log,
			() => this.tail,
			() => ({
				headPaused: this.headPaused,
				tailPaused: this.tailPaused,
			}),
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
			// Find the lowest offset of all doc contexts' lastSuccessfulOffset and emit pause at that offset to ensure we dont miss any messages during resume (reprocessing)
			let lowestOffset = offset ?? Number.MAX_SAFE_INTEGER;
			for (const docContext of this.contexts) {
				if (docContext.lastSuccessfulOffset < lowestOffset) {
					lowestOffset = docContext.lastSuccessfulOffset;
				}
			}
			lowestOffset =
				lowestOffset > -1 && lowestOffset < Number.MAX_SAFE_INTEGER ? lowestOffset : 0;
			this.headPaused = true;
			this.tailPaused = true;
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
	 * Updates the head to the new offset. The head offset will not be updated if it stays the same or moves backwards, unless headPaused is true.
	 * @returns True if the head was updated, false if it was not.
	 */
	public setHead(head: IQueuedMessage) {
		if (head.offset > this.head.offset || this.headPaused) {
			// If head is moving backwards
			if (head.offset <= this.head.offset) {
				if (head.offset <= this.lastCheckpoint.offset) {
					Lumberjack.info(
						"Not updating contextManager head since new head's offset is <= last checkpoint, returning early",
						{
							newHeadOffset: head.offset,
							currentHeadOffset: this.head.offset,
							lastCheckpointOffset: this.lastCheckpoint.offset,
							currentTailOffset: this.tail.offset,
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
						currentTailOffset: this.tail.offset,
						headPaused: this.headPaused,
					},
				);
			}

			if (this.headPaused) {
				Lumberjack.info("Setting headPaused to false", {
					newHeadOffset: head.offset,
					currentHeadOffset: this.head.offset,
					currentTailOffset: this.tail.offset,
				});
				this.headPaused = false;
			}

			this.head = head;
			return true;
		}

		return false;
	}

	public setTail(tail: IQueuedMessage) {
		assert(
			(tail.offset > this.tail.offset || this.tailPaused) && tail.offset <= this.head.offset,
			`Tail offset ${tail.offset} must be greater than the current tail offset ${this.tail.offset} or tailPaused should be true (${this.tailPaused}), and less than or equal to the head offset ${this.head.offset}.`,
		);

		if (tail.offset <= this.tail.offset) {
			Lumberjack.info(
				"Allowing the contextManager tail to move backwards to the specified offset",
				{
					newTailOffset: tail.offset,
					currentTailOffset: this.tail.offset,
					currentHeadOffset: this.head.offset,
					tailPaused: this.tailPaused,
				},
			);
		}

		if (this.tailPaused) {
			Lumberjack.info("Setting tailPaused to false", {
				newTailOffset: tail.offset,
				currentTailOffset: this.tail.offset,
				currentHeadOffset: this.head.offset,
			});
			this.tailPaused = false;
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
