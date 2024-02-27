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
	private timer: NodeJS.Timer | undefined;

	constructor(
		private readonly context: IContext,
		private readonly checkpointConfiguration?: NoOpLambdaCheckpointConfiguration,
	) {
		this.timer = undefined;
	}

	public handler(message: IQueuedMessage) {
		// default
		if (!this.checkpointConfiguration || !this.checkpointConfiguration?.enabled) {
			this.context.checkpoint(message);
			return undefined;
		}

		this.opsCount++;
		if (this.opsCount >= this.checkpointConfiguration.maxMessages) {
			this.configurableCheckpoint(message);
		}

		if (this.checkpointConfiguration?.enabled) {
			this.resetTimer(message, this.checkpointConfiguration.maxTime);
		}

		return undefined;
	}

	public close(): void {}

	private configurableCheckpoint(message: IQueuedMessage) {
		if (message.offset > this.lastCheckpointOffset) {
			this.context.checkpoint(message);
			if (this.timer) {
				clearTimeout(this.timer);
				this.timer = undefined;
			}
			this.opsCount = 0;
			this.lastCheckpointOffset = message.offset;
		}
	}

	private resetTimer(message: IQueuedMessage, timeout: number) {
		if (this.timer) {
			clearTimeout(this.timer);
		}
		this.timer = setInterval(() => {
			this.configurableCheckpoint(message);
		}, timeout);
	}
}

export interface NoOpLambdaCheckpointConfiguration {
	enabled: boolean;
	maxMessages: number;
	maxTime: number;
}
