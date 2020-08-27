/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IQueuedMessage } from "./queue";
import { ILogger, IContext } from "./lambdas";

/**
 * Allows checkpointing the minimum offset for multiple lambdas
 * This is useful to use for a CombinedLambda
 */
export class CombinedContext {
	public log: ILogger;

	private currentCheckpoint: IQueuedMessage | undefined;

	private readonly checkpoints: (IQueuedMessage | undefined)[];

	constructor(private readonly context: IContext, private readonly lambdaCount: number) {
		this.checkpoints = new Array(lambdaCount);
	}

	public getContext(id: number): IContext {
		return {
			log: this.log,
			checkpoint: (message) => this.checkpoint(id, message),
			error: (error, restart) => this.error(id, error, restart),
		};
	}

	private checkpoint(id: number, queuedMessage: IQueuedMessage): void {
		if (id > this.lambdaCount || id < 0) {
			throw new Error("Invalid checkpoint lambda id");
		}

		this.checkpoints[id] = queuedMessage;

		const lowestMessage = this.getLowestMessage();
		if (lowestMessage !== undefined &&
			(this.currentCheckpoint === undefined || this.currentCheckpoint.offset < lowestMessage.offset)) {
			// checkpoint if we have a lowest message and do not have a current checkpoint,
			// or if it's higher than our current checkpoint
			this.currentCheckpoint = lowestMessage;
			this.context.checkpoint(lowestMessage);
		}
	}

	private error(_id: number, error: any, restart: boolean): void {
		this.context.error(error, restart);
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
