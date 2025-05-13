/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IQueuedMessage } from "./queue";
import { IContext, IContextErrorData } from "./lambdas";

/**
 * Allows checkpointing the minimum offset for multiple lambdas
 * This is useful to use for a CombinedLambda
 * @internal
 */
export class CombinedContext {
	private currentCheckpoint: IQueuedMessage | undefined;

	private readonly checkpoints: (IQueuedMessage | undefined)[];

	constructor(private readonly context: IContext) {
		this.checkpoints = [];
	}

	public createContext(): IContext {
		const id = this.checkpoints.push(undefined) - 1;

		return {
			log: this.context.log,
			checkpoint: (message) => this.checkpoint(id, message),
			error: (error, errorData) => this.error(id, error, errorData),
			pause: (offset, reason) => {
				this.context.pause(offset, reason);
			},
			resume: () => {
				this.context.resume();
			},
		};
	}

	private checkpoint(id: number, queuedMessage: IQueuedMessage): void {
		this.checkpoints[id] = queuedMessage;

		const lowestMessage = this.getLowestMessage();
		if (
			lowestMessage !== undefined &&
			(this.currentCheckpoint === undefined ||
				this.currentCheckpoint.offset < lowestMessage.offset)
		) {
			// checkpoint if we have a lowest message and do not have a current checkpoint,
			// or if it's higher than our current checkpoint
			this.currentCheckpoint = lowestMessage;
			this.context.checkpoint(lowestMessage);
		}
	}

	private error(_id: number, error: any, errorData: IContextErrorData): void {
		this.context.error(error, errorData);
	}

	/**
	 * Returns the lowest checkpoint for all the lambdas
	 * This will return undefined if a lambda has not checkpointed
	 */
	private getLowestMessage(): IQueuedMessage | undefined {
		let lowestMessage: IQueuedMessage | undefined;

		for (const message of this.checkpoints) {
			if (message === undefined) {
				// one of the lambdas has not submitted a checkpoint
				return undefined;
			}

			if (lowestMessage === undefined || lowestMessage.offset > message.offset) {
				lowestMessage = message;
			}
		}

		return lowestMessage;
	}
}
