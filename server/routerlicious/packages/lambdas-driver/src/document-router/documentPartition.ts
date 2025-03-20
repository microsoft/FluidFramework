/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { inspect } from "util";
import {
	IContextErrorData,
	IPartitionLambda,
	IPartitionLambdaConfig,
	IPartitionLambdaFactory,
	IQueuedMessage,
	LambdaCloseType,
} from "@fluidframework/server-services-core";
import { getLumberBaseProperties, Lumberjack } from "@fluidframework/server-services-telemetry";
import { QueueObject, queue } from "async";
import { DocumentContext } from "./documentContext";

export class DocumentPartition {
	private readonly q: QueueObject<IQueuedMessage>;
	private readonly lambdaP: Promise<IPartitionLambda> | Promise<void>;
	private lambda: IPartitionLambda | undefined;
	private corrupt = false;
	private closed = false;
	private paused = false;
	private activityTimeoutTime: number | undefined;
	private readonly restartOnErrorNames: string[] = [];

	constructor(
		factory: IPartitionLambdaFactory<IPartitionLambdaConfig>,
		private readonly tenantId: string,
		private readonly documentId: string,
		public readonly context: DocumentContext,
		private readonly activityTimeout: number,
	) {
		this.updateActivityTime();

		const documentConfig: IPartitionLambdaConfig = {
			tenantId,
			documentId,
		};

		this.restartOnErrorNames = ["MongoServerSelectionError"];

		this.q = queue((message: IQueuedMessage, callback) => {
			// Winston.verbose(`${message.topic}:${message.partition}@${message.offset}`);
			try {
				if (!this.corrupt) {
					// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
					const optionalPromise = this.lambda!.handler(message)
						?.then(callback as any)
						.catch((error) => {
							this.markAsCorrupt(error, message);
							callback();
						});
					if (optionalPromise) {
						return;
					}
				} else {
					// Until we can dead letter - simply checkpoint as handled
					this.context.checkpoint(message);
				}
			} catch (error) {
				// TODO dead letter queue for bad messages, etc... when the lambda is throwing an exception
				// for now we will simply continue on to keep the queue flowing
				this.markAsCorrupt(error, message);
			}

			// Handle the next message
			callback();
		}, 1);
		this.q.pause();

		this.context.on("error", (error: any, errorData: IContextErrorData) => {
			Lumberjack.verbose("Listening for errors in documentPartition, context error event");
			if (errorData.markAsCorrupt) {
				this.markAsCorrupt(error, errorData.markAsCorrupt);
			} else if (errorData.restart) {
				// ensure no more messages are processed by this partition
				// while the process is restarting / closing
				this.close(LambdaCloseType.Error);
			}
		});

		// Create the lambda to handle the document messages
		this.lambdaP = factory
			.create(documentConfig, context, this.updateActivityTime.bind(this))
			.then((lambda) => {
				this.lambda = lambda;
				this.q.resume();
			})
			.catch((error) => {
				if (
					(error.name && this.restartOnErrorNames.includes(error.name as string)) ||
					error.shouldRestart
				) {
					this.context.error(error, {
						restart: true,
						tenantId: this.tenantId,
						documentId: this.documentId,
						errorLabel: "docPartition:lambdaFactory.create",
					});
				} else {
					// There is no need to pass the message to be checkpointed to markAsCorrupt().
					// The message, in this case, would be the head in the DocumentContext. But the DocumentLambda
					// that creates this DocumentPartition will also put the same message in the queue.
					// So the DocumentPartition will see that message in the queue above, and checkpoint it
					// since the document was marked as corrupted.
					this.markAsCorrupt(error);
					this.q.resume();
				}
			});
	}

	public process(message: IQueuedMessage) {
		if (this.closed) {
			return;
		}

		this.q.push(message).catch((error) => {
			const lumberjackProperties = {
				...getLumberBaseProperties(this.documentId, this.tenantId),
			};
			Lumberjack.error(
				"Error pushing raw message to queue in document partition",
				lumberjackProperties,
				error,
			);
		});
		this.updateActivityTime();
	}

	public close(closeType: LambdaCloseType) {
		if (this.closed) {
			return;
		}

		this.closed = true;

		// Stop any future processing
		this.q.kill();

		if (this.lambda) {
			this.lambda.close(closeType);
		} else {
			this.lambdaP
				.then((lambda) => {
					lambda.close(closeType);
				})
				.catch((error) => {
					// Lambda was never created - ignoring
				});
		}
	}

	public isInactive(now: number = Date.now()) {
		return (
			!this.context.hasPendingWork() &&
			this.activityTimeoutTime &&
			now > this.activityTimeoutTime
		);
	}

	/**
	 * Marks this document partition as corrupt
	 * Future messages will be checkpointed but no real processing will happen
	 */
	private markAsCorrupt(error: any, message?: IQueuedMessage) {
		if (this.closed) {
			Lumberjack.info(
				"Skipping marking document as corrupt since the document partition is already closed",
				{
					...getLumberBaseProperties(this.documentId, this.tenantId),
					error: error.toString(),
				},
			);
			return;
		}
		this.corrupt = true;
		this.context.log?.error(`Marking document as corrupted due to error: ${inspect(error)}`, {
			messageMetaData: {
				documentId: this.documentId,
				tenantId: this.tenantId,
			},
		});

		Lumberjack.error(
			`Marking document as corrupted due to error`,
			getLumberBaseProperties(this.documentId, this.tenantId),
			error,
		);
		this.context.error(error, {
			restart: false,
			tenantId: this.tenantId,
			documentId: this.documentId,
			errorLabel: "documentPartition:markAsCorrupt",
		});
		if (message) {
			this.context.checkpoint(message);
		}
	}

	private updateActivityTime(activityTime?: number) {
		const cacluatedActivityTimeout =
			Date.now() + (this.lambda?.activityTimeout ?? this.activityTimeout);
		this.activityTimeoutTime =
			activityTime !== undefined ? activityTime : cacluatedActivityTimeout;
	}

	public pause(offset: number) {
		if (this.paused) {
			Lumberjack.warning("Doc partition already paused, returning early.", {
				...getLumberBaseProperties(this.documentId, this.tenantId),
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

		// Its possible that some other doc partition triggered the pause
		// So we need to make sure to set the paused state for this doc partition's context in case its not already set
		// This will allow its head to move backwards/reprocess ops as needed during resume
		this.context.setStateToPause();

		Lumberjack.info("Doc partition paused", {
			...getLumberBaseProperties(this.documentId, this.tenantId),
			offset,
		});
	}

	public resume() {
		if (!this.paused) {
			Lumberjack.warning("Doc partition already resumed, returning early.", {
				...getLumberBaseProperties(this.documentId, this.tenantId),
			});
			return;
		}
		this.paused = false;

		this.q.resume();

		if (this.lambda?.resume) {
			this.lambda.resume();
		}
		Lumberjack.info("Doc partition resumed", {
			...getLumberBaseProperties(this.documentId, this.tenantId),
		});
	}
}
