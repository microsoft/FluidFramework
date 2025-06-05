/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IContext, IQueuedMessage, IPartitionLambda } from "@fluidframework/server-services-core";

/**
 * @internal
 */
export class NoOpLambda implements IPartitionLambda {
	private opsCount = 0;
	private lastCheckpointOffset = 0;
	private idleTimer: ReturnType<typeof setInterval> | undefined = undefined;
	private maxTimer: ReturnType<typeof setInterval> | undefined = undefined;
	private currentMessage;

	constructor(
		private readonly context: IContext,
		private readonly checkpointConfiguration?: NoOpLambdaCheckpointConfiguration,
	) {}

	/**
	 * {@inheritDoc IPartitionLambda.handler}
	 */
	public handler(message: IQueuedMessage): undefined {
		// default
		if (!this.checkpointConfiguration?.enabled) {
			this.context.checkpoint(message);
			if (this.context.setLastSuccessfulOffset) {
				this.context.setLastSuccessfulOffset(message.offset);
			}
			return undefined;
		}

		this.currentMessage = message;

		this.opsCount++;
		if (this.opsCount >= this.checkpointConfiguration.maxMessages) {
			this.configurableCheckpoint(this.currentMessage);
		}

		if (!this.maxTimer) {
			this.resetMaxTimer();
		}

		if (this.checkpointConfiguration?.enabled) {
			this.resetIdleTimer();
		}

		return undefined;
	}

	public close(): void {}

	private configurableCheckpoint(message: IQueuedMessage): void {
		if (message?.offset > this.lastCheckpointOffset) {
			this.context.checkpoint(message);
			if (this.idleTimer) {
				clearTimeout(this.idleTimer);
				this.idleTimer = undefined;
			}
			if (this.maxTimer) {
				clearTimeout(this.maxTimer);
				this.maxTimer = undefined;
			}
			this.opsCount = 0;
			this.lastCheckpointOffset = message.offset;
		}
	}

	private resetMaxTimer(): void {
		console.log(`Resetting max timer`);
		this.maxTimer = setInterval(
			() => {
				console.log(`MaxTime checkpoint`);
				this.configurableCheckpoint(this.currentMessage);
			},
			this.checkpointConfiguration?.maxTime,
		);
	}

	private resetIdleTimer(): void {
		if (this.idleTimer) {
			clearTimeout(this.idleTimer);
		}
		this.idleTimer = setInterval(
			() => {
				this.configurableCheckpoint(this.currentMessage);
			},
			this.checkpointConfiguration?.idleTime,
		);
	}
}

export interface NoOpLambdaCheckpointConfiguration {
	enabled: boolean;
	maxMessages: number;
	maxTime: number;
	idleTime: number;
}
