/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { EventEmitter } from "events";
import {
	IConsumer,
	IQueuedMessage,
	IPartitionLambda,
	IPartitionLambdaFactory,
	ILogger,
	LambdaCloseType,
	IContextErrorData,
} from "@fluidframework/server-services-core";
import { QueueObject, queue } from "async";
import { Lumberjack } from "@fluidframework/server-services-telemetry";
import { Provider } from "nconf";
import { CheckpointManager } from "./checkpointManager";
import { Context } from "./context";

/**
 * Partition of a message stream. Manages routing messages to individual handlers. And then maintaining the
 * overall partition offset.
 */
export class Partition extends EventEmitter {
	private readonly q: QueueObject<IQueuedMessage>;
	private lambdaP: Promise<IPartitionLambda> | Promise<void> | undefined;
	private lambda: IPartitionLambda | undefined;
	private readonly checkpointManager: CheckpointManager;
	private readonly context: Context;
	private closed = false;
	private paused = false;

	constructor(
		private readonly id: number,
		factory: IPartitionLambdaFactory,
		consumer: IConsumer,
		private readonly logger?: ILogger,
		private readonly config?: Provider,
	) {
		super();

		this.checkpointManager = new CheckpointManager(id, consumer);
		this.context = new Context(this.checkpointManager, this.logger);
		this.context.on("error", (error: any, errorData: IContextErrorData) => {
			Lumberjack.verbose("Emitting error from partition, context error event");
			this.emit("error", error, errorData);
		});

		this.context.on("pause", (offset: number, reason?: any) => {
			this.emit("pause", this.id, offset, reason);
		});

		this.context.on("resume", () => {
			this.emit("resume", this.id);
		});

		// Create the incoming message queue
		this.q = queue((message: IQueuedMessage, callback) => {
			try {
				// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
				const optionalPromise = this.lambda!.handler(message)
					?.then(callback as any)
					.catch(callback);
				if (optionalPromise) {
					return;
				}

				callback();
			} catch (error: any) {
				callback(error);
			}
		}, 1);
		this.q.pause();

		this.lambdaP = factory
			.create(undefined, this.context)
			.then((lambda) => {
				this.lambda = lambda;
				this.lambdaP = undefined;
				this.q.resume();
			})
			.catch((error) => {
				if (this.closed) {
					return;
				}

				const errorData: IContextErrorData = {
					restart: true,
					errorLabel: "partition:lambdaFactory.create",
				};
				this.emit("error", error, errorData);
				this.q.kill();
			});

		this.q.error((error) => {
			const errorData: IContextErrorData = {
				restart: true,
			};
			this.emit("error", error, errorData);
		});
	}

	public process(rawMessage: IQueuedMessage) {
		if (this.closed) {
			return;
		}

		if (this.paused) {
			Lumberjack.info("Partition is paused, skipping pushing message to queue", {
				partitionId: this.id,
				messageOffset: rawMessage.offset,
			});
			return;
		}
		this.q.push(rawMessage).catch((error) => {
			Lumberjack.error("Error pushing raw message to queue in partition", undefined, error);
		});
	}

	public close(closeType: LambdaCloseType): void {
		this.closed = true;

		// Stop any pending message processing
		this.q.kill();

		// Close checkpoint related classes
		this.checkpointManager.close();
		this.context.close();

		// Notify the lambda of the close
		if (this.lambda) {
			this.lambda.close(closeType);
			this.lambda = undefined;
		} else if (this.lambdaP) {
			// asynchronously close the lambda since it's not created yet
			this.lambdaP
				.then((lambda) => {
					lambda.close(closeType);
				})
				.catch((error) => {
					// Lambda never existed - no need to close
				})
				.finally(() => {
					this.lambda = undefined;
					this.lambdaP = undefined;
				});
		}

		this.removeAllListeners();
	}

	public pause(offset: number): void {
		if (this.paused) {
			Lumberjack.warning(`Partition already paused, returning early.`, {
				partitionId: this.id,
				offset,
			});
			return;
		}
		this.paused = true;

		this.q.pause();
		this.q.remove(() => true); // flush all the messages in the queue since kafka consumer will resume from last successful offset

		if (this.lambda?.pause) {
			this.lambda.pause(offset);
		}
		Lumberjack.info(`Partition paused`, { partitionId: this.id, offset });
	}

	public resume(): void {
		if (!this.paused) {
			Lumberjack.warning(`Partition already resumed, returning early.`, {
				partitionId: this.id,
			});
			return;
		}
		this.paused = false;

		this.q.resume();

		if (this.lambda?.resume) {
			// needed for documentLambdas
			this.lambda.resume();
		}
		Lumberjack.info(`Partition resumed`, { partitionId: this.id });
	}

	/**
	 * Stops processing on the partition
	 */
	public async drain(): Promise<void> {
		// Drain the queue of any pending operations
		const drainedP = new Promise<void>((resolve, reject) => {
			// If not entries in the queue we can exit immediatley
			if (this.q.length() === 0) {
				this.logger?.info(`No pending work for partition ${this.id}. Exiting early`);
				Lumberjack.info(`No pending work for partition ${this.id}. Exiting early`);
				return resolve();
			}

			// Wait until the queue is drained
			this.logger?.info(`Waiting for queue to drain for partition ${this.id}`);
			Lumberjack.info(`Waiting for queue to drain for partition ${this.id}`);

			this.q.drain(() => {
				this.logger?.info(`Drained partition ${this.id}`);
				Lumberjack.info(`Drained partition ${this.id}`);
				resolve();
			});
		});
		await drainedP;

		// Checkpoint at the latest offset
		try {
			await this.checkpointManager.flush();
		} catch (err) {
			Lumberjack.error(
				"Error during checkpointManager.flush call",
				{
					partition: this.id,
					ignoreCheckpointFlushExceptionFlag: this.config?.get(
						"checkpoints:ignoreCheckpointFlushException",
					),
				},
				err,
			);
			if (!this.config?.get("checkpoints:ignoreCheckpointFlushException")) {
				throw err;
			} // else, dont throw the error so that the service continues to shut down gracefully
		}
	}
}
