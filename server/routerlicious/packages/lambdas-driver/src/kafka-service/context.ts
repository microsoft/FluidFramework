/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { EventEmitter } from "events";
import {
	IContext,
	IQueuedMessage,
	ILogger,
	IContextErrorData,
} from "@fluidframework/server-services-core";
import { Lumberjack } from "@fluidframework/server-services-telemetry";
import { CheckpointManager } from "./checkpointManager";

export class Context extends EventEmitter implements IContext {
	private closed = false;

	constructor(
		private readonly checkpointManager: CheckpointManager,
		public readonly log: ILogger | undefined,
	) {
		super();
	}

	/**
	 * Updates the checkpoint for the partition
	 */
	public checkpoint(queuedMessage: IQueuedMessage, restartFlag?: boolean) {
		if (this.closed) {
			return;
		}

		this.checkpointManager.checkpoint(queuedMessage).catch((error) => {
			if (this.closed) {
				// don't emit errors after closing
				return;
			}

			// Close context on error. Once the checkpointManager enters an error state it will stay there.
			// We will look to restart on checkpointing given it likely indicates a Kafka connection issue.
			this.error(error, { restart: restartFlag ?? true });
		});
	}

	/**
	 * Closes the context with an error.
	 * @param error - The error object or string
	 * @param errorData - Additional information about the error
	 */
	public error(error: any, errorData: IContextErrorData) {
		Lumberjack.verbose("Emitting error from context");
		this.emit("error", error, errorData);
	}

	/**
	 * Closes the context
	 */
	public close(): void {
		this.closed = true;

		this.removeAllListeners();
	}

	/**
	 * Pauses the context
	 */
	public pause(offset: number, reason?: any): void {
		this.emit("pause", offset, reason);
	}

	/**
	 * Resumes the context
	 */
	public resume(): void {
		this.emit("resume");
	}
}
