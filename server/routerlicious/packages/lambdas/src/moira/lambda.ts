/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	extractBoxcar,
	IContext,
	IQueuedMessage,
	IPartitionLambda,
	ISequencedOperationMessage,
	IServiceConfiguration,
	SequencedOperationType,
} from "@fluidframework/server-services-core";
import {
	CommonProperties,
	getLumberBaseProperties,
	Lumberjack,
} from "@fluidframework/server-services-telemetry";
import axios from "axios";
import shajs from "sha.js";

/**
 * @internal
 */
export class MoiraLambda implements IPartitionLambda {
	private pending = new Map<string, ISequencedOperationMessage[]>();
	private pendingOffset: IQueuedMessage | undefined;
	private current = new Map<string, ISequencedOperationMessage[]>();

	constructor(
		protected context: IContext,
		private readonly serviceConfiguration: IServiceConfiguration,
		private readonly tenantId: string,
		private readonly documentId: string,
	) {}

	/**
	 * {@inheritDoc IPartitionLambda.handler}
	 */
	public handler(message: IQueuedMessage): undefined {
		const boxcar = extractBoxcar(message);

		for (const baseMessage of boxcar.contents) {
			if (baseMessage.type === SequencedOperationType) {
				const value = baseMessage as ISequencedOperationMessage;

				// Remove traces and serialize content before writing to mongo.
				value.operation.traces = [];

				const topic = `${value.tenantId}/${value.documentId}`;

				let pendingMessages = this.pending.get(topic);
				if (!pendingMessages) {
					pendingMessages = [];
					this.pending.set(topic, pendingMessages);
				}

				pendingMessages.push(value);
			}
		}

		this.pendingOffset = message;
		this.sendPending();

		return undefined;
	}

	public close(): void {
		this.pending.clear();
		this.current.clear();
	}

	private sendPending(): void {
		// If there is work currently being sent or we have no pending work return early
		if (this.current.size > 0 || this.pending.size === 0) {
			return;
		}

		// Swap current and pending
		const temp = this.current;
		this.current = this.pending;
		this.pending = temp;
		const batchOffset = this.pendingOffset;

		const allProcessed: Promise<void[]>[] = [];

		// Process all the batches + checkpoint
		for (const [, messages] of this.current) {
			const processP = this.processMoiraCoreParallel(messages);
			allProcessed.push(processP);
		}

		Promise.all(allProcessed)
			.then(() => {
				this.current.clear();
				this.context.checkpoint(batchOffset as IQueuedMessage);
				this.sendPending();
			})
			.catch((error) => {
				this.context.error(error, { restart: true });
			});
	}

	private createDerivedGuid(referenceGuid: string, identifier: string): string {
		const hexHash = shajs("sha1").update(`${referenceGuid}:${identifier}`).digest("hex");
		return (
			`${hexHash.slice(0, 8)}-${hexHash.slice(8, 12)}-` +
			`${hexHash.slice(12, 16)}-${hexHash.slice(16, 20)}-${hexHash.slice(20, 32)}`
		);
	}

	private async processMoiraCoreParallel(
		messages: ISequencedOperationMessage[],
	): Promise<void[]> {
		const processedMessages: Map<string, Promise<void>> = new Map();

		for (const message of messages) {
			if (message?.operation?.type === "op") {
				const contents = JSON.parse(message.operation.contents as string);
				const opData = contents.contents?.contents?.content?.contents;
				if (opData && opData.op === 0 && opData.changeSet !== undefined) {
					// At this point is checked to be submitted to Moira
					const branchGuid: string = contents.contents.contents.content.address;

					const currentProcessing = processedMessages.get(branchGuid);
					if (currentProcessing) {
						processedMessages.set(
							branchGuid,
							currentProcessing.then(async () =>
								this.processMoiraCore(branchGuid, opData, message),
							),
						);
					} else {
						processedMessages.set(
							branchGuid,
							this.processMoiraCore(branchGuid, opData, message),
						);
					}
				}
			}
		}
		return Promise.all(processedMessages.values());
	}

	private async processMoiraCore(
		branchGuid: string,
		opData: any,
		message: ISequencedOperationMessage,
	): Promise<void> {
		const commitGuid = opData.guid;

		const logMessage = `MH Commit: branch: ${branchGuid},
        commit ${commitGuid},
        changeSet:  ${JSON.stringify(opData.changeSet, undefined, 2)}`;
		this.context.log?.info(logMessage);

		if (this.serviceConfiguration.enableLumberjack) {
			Lumberjack.info(logMessage, getLumberBaseProperties(this.documentId, this.tenantId));
		}

		let parentCommitGuid = opData.referenceGuid;
		// Create a branch for the first commit that does not yet reference any other commit
		if (opData.referenceGuid === "") {
			parentCommitGuid = await this.createBranch(branchGuid);
		}

		await this.createCommit(commitGuid, parentCommitGuid, branchGuid, opData, message);
	}

	private async createBranch(branchGuid: string): Promise<string> {
		const rootCommitGuid = this.createDerivedGuid(branchGuid, "root");
		const branchCreationResponse = await axios.post(
			`${this.serviceConfiguration.moira.endpoint}/branch`,
			{
				guid: branchGuid,
				rootCommitGuid,
				meta: {},
				created: 0,
			},
		);

		const lumberProperties = {
			...getLumberBaseProperties(this.documentId, this.tenantId),
			[CommonProperties.statusCode]: branchCreationResponse.status,
		};

		if (branchCreationResponse.status === 200) {
			const logMessage = `Branch with guid: ${branchGuid} created`;
			this.context.log?.info(logMessage);
			if (this.serviceConfiguration.enableLumberjack) {
				Lumberjack.info(logMessage, lumberProperties);
			}
		} else {
			const logMessage = `Branch with guid ${branchGuid} failed`;
			this.context.log?.error(logMessage);
			if (this.serviceConfiguration.enableLumberjack) {
				Lumberjack.error(logMessage, lumberProperties);
			}
		}
		return rootCommitGuid;
	}

	private async createCommit(
		commitGuid: string,
		parentGuid: string,
		branchGuid: string,
		opData: any,
		message: ISequencedOperationMessage,
	): Promise<void> {
		try {
			const commitData = {
				guid: commitGuid,
				branchGuid,
				parentGuid,
				meta: {
					remoteHeadGuid: opData.remoteHeadGuid,
					localBranchStart: opData.localBranchStart,
					sequenceNumber: message.operation.sequenceNumber,
					minimumSequenceNumber: message.operation.minimumSequenceNumber,
				},
			};
			const commitCreationResponse = await axios.post(
				`${this.serviceConfiguration.moira.endpoint}/branch/${branchGuid}/commit`,
				{
					...commitData,
					changeSet: JSON.stringify(opData.changeSet),
					rebase: true,
				},
			);

			const lumberProperties = {
				...getLumberBaseProperties(this.documentId, this.tenantId),
				[CommonProperties.statusCode]: commitCreationResponse.status,
			};

			if (commitCreationResponse.status === 200) {
				const logMessage = `Commit created ${JSON.stringify(commitData)}`;
				this.context.log?.info(logMessage);
				if (this.serviceConfiguration.enableLumberjack) {
					Lumberjack.info(logMessage, lumberProperties);
				}
			} else {
				const logMessage = `Commit failed ${JSON.stringify(commitData)}`;
				this.context.log?.error(logMessage);
				if (this.serviceConfiguration.enableLumberjack) {
					Lumberjack.error(logMessage, lumberProperties);
				}
			}
		} catch (error: any) {
			const logMessage = `Commit failed. ${error.message}`;
			this.context.log?.error(logMessage);
			if (this.serviceConfiguration.enableLumberjack) {
				Lumberjack.error(
					logMessage,
					getLumberBaseProperties(this.documentId, this.tenantId),
					error,
				);
			}
		}
	}
}
