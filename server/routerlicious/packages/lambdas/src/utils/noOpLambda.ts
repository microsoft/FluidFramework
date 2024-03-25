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
	private idleTimer: NodeJS.Timer | undefined = undefined;
	private maxTimer: NodeJS.Timer | undefined = undefined;
	private currentMessage;

	constructor(
		private readonly context: IContext,
		private readonly checkpointConfiguration?: NoOpLambdaCheckpointConfiguration,
	) {}

	public handler(message: IQueuedMessage) {
		// default
		if (!this.checkpointConfiguration?.enabled) {
			this.context.checkpoint(message);
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

	private configurableCheckpoint(message: IQueuedMessage) {
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

	private resetMaxTimer() {
		console.log(`Resetting max timer`);
		this.maxTimer = setInterval(
			() => {
				console.log(`MaxTime checkpoint`);
				this.configurableCheckpoint(this.currentMessage);
			},
			this.checkpointConfiguration?.maxTime,
		);
	}

	private resetIdleTimer() {
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
