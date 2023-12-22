/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "assert";
import { inspect } from "util";
import { ProtocolOpHandler } from "@fluidframework/protocol-base";
import {
	IDocumentSystemMessage,
	ISequencedDocumentMessage,
	ISummaryAck,
	ISummaryNack,
	MessageType,
	ISequencedDocumentAugmentedMessage,
	ISequencedDocumentSystemMessage,
	IProtocolState,
} from "@fluidframework/protocol-definitions";
import { DocumentContext } from "@fluidframework/server-lambdas-driver";
import {
	ControlMessageType,
	extractBoxcar,
	IContext,
	IControlMessage,
	IProducer,
	IScribe,
	ISequencedOperationMessage,
	IServiceConfiguration,
	SequencedOperationType,
	IQueuedMessage,
	IPartitionLambda,
	LambdaCloseType,
} from "@fluidframework/server-services-core";
import {
	getLumberBaseProperties,
	Lumber,
	LumberEventName,
	Lumberjack,
	CommonProperties,
} from "@fluidframework/server-services-telemetry";
import Deque from "double-ended-queue";
import * as _ from "lodash";
import {
	createSessionMetric,
	logCommonSessionEndMetrics,
	CheckpointReason,
	ICheckpoint,
	IServerMetadata,
} from "../utils";
import { ICheckpointManager, IPendingMessageReader, ISummaryWriter } from "./interfaces";
import { getClientIds, initializeProtocol, sendToDeli } from "./utils";

/**
 * @internal
 */
export class ScribeLambda implements IPartitionLambda {
	// Value of the last processed Kafka offset
	private lastOffset: number;

	// Pending checkpoint information
	private pendingCheckpointScribe: IScribe | undefined;
	private pendingCheckpointOffset: IQueuedMessage | undefined;
	private pendingP: Promise<void> | undefined;
	private readonly pendingCheckpointMessages = new Deque<ISequencedOperationMessage>();

	// Messages not yet processed by protocolHandler
	private pendingMessages: Deque<ISequencedDocumentMessage>;

	// Current sequence/msn of the last processed offset
	private sequenceNumber = 0;
	private minSequenceNumber = 0;

	// Ref of the last client generated summary
	private lastClientSummaryHead: string | undefined;

	// Seqeunce number of the last summarised op
	private lastSummarySequenceNumber: number | undefined;

	// Refs of the service summaries generated since the last client generated summary.
	private validParentSummaries: string[] | undefined;

	// Is the document marked as corrupted
	private isDocumentCorrupt: boolean = false;

	// Indicates whether cache needs to be cleaned after processing a message
	private clearCache: boolean = false;

	// Indicates if the lambda was closed
	private closed: boolean = false;

	// Used to control checkpoint logic
	private readonly checkpointInfo: ICheckpoint = {
		lastCheckpointTime: Date.now(),
		rawMessagesSinceCheckpoint: 0,
	};

	// Used to checkpoint if no active clients
	private noActiveClients: boolean = false;
	private globalCheckpointOnly: boolean;

	constructor(
		protected readonly context: IContext,
		protected tenantId: string,
		protected documentId: string,
		private readonly summaryWriter: ISummaryWriter,
		private readonly pendingMessageReader: IPendingMessageReader | undefined,
		private readonly checkpointManager: ICheckpointManager,
		scribe: IScribe,
		private readonly serviceConfiguration: IServiceConfiguration,
		private readonly producer: IProducer | undefined,
		private protocolHandler: ProtocolOpHandler,
		private protocolHead: number,
		messages: ISequencedDocumentMessage[],
		private scribeSessionMetric: Lumber<LumberEventName.ScribeSessionResult> | undefined,
		private readonly transientTenants: Set<string>,
		private readonly disableTransientTenantFiltering: boolean,
		private readonly restartOnCheckpointFailure: boolean,
		private readonly kafkaCheckpointOnReprocessingOp: boolean,
		private readonly isEphemeralContainer: boolean,
		private readonly localCheckpointEnabled: boolean,
	) {
		this.lastOffset = scribe.logOffset;
		this.setStateFromCheckpoint(scribe);
		this.pendingMessages = new Deque<ISequencedDocumentMessage>(messages);
		this.globalCheckpointOnly = this.localCheckpointEnabled ? false : true;
	}

	public async handler(message: IQueuedMessage) {
		// Skip any log messages we have already processed. Can occur in the case Kafka needed to restart but
		// we had already checkpointed at a given offset.
		if (this.lastOffset !== undefined && message.offset <= this.lastOffset) {
			const reprocessOpsMetric = Lumberjack.newLumberMetric(LumberEventName.ReprocessOps);
			reprocessOpsMetric.setProperties({
				...getLumberBaseProperties(this.documentId, this.tenantId),
				kafkaMessageOffset: message.offset,
				databaseLastOffset: this.lastOffset,
			});

			this.updateCheckpointMessages(message);
			try {
				if (this.kafkaCheckpointOnReprocessingOp) {
					this.context.checkpoint(message, this.restartOnCheckpointFailure);
				}
				reprocessOpsMetric.setProperty(
					"kafkaCheckpointOnReprocessingOp",
					this.kafkaCheckpointOnReprocessingOp,
				);
				reprocessOpsMetric.success(`Successfully reprocessed repeating ops.`);
			} catch (error) {
				reprocessOpsMetric.error(`Error while reprocessing ops.`, error);
			}
			return;
		} else if (this.lastOffset === undefined) {
			Lumberjack.error(
				`No value for lastOffset`,
				getLumberBaseProperties(this.documentId, this.tenantId),
			);
		}
		// if lastOffset is undefined or we have skipped all the previously processed ops,
		// we want to set the offset we store in the database equal to the kafka message offset
		this.lastOffset = message.offset;

		const boxcar = extractBoxcar(message);

		for (const baseMessage of boxcar.contents) {
			if (baseMessage.type === SequencedOperationType) {
				const value = baseMessage as ISequencedOperationMessage;

				// Skip messages that were already checkpointed on a prior run.
				if (value.operation.sequenceNumber <= this.sequenceNumber) {
					continue;
				}

				const lastProtocolHandlerSequenceNumber =
					this.pendingMessages.peekBack()?.sequenceNumber ??
					this.protocolHandler.sequenceNumber;

				// Handles a partial checkpoint case where messages were inserted into DB but checkpointing failed.
				if (value.operation.sequenceNumber <= lastProtocolHandlerSequenceNumber) {
					continue;
				}

				// Ensure protocol handler sequence numbers are monotonically increasing
				// eslint-disable-next-line @typescript-eslint/restrict-plus-operands
				if (value.operation.sequenceNumber !== lastProtocolHandlerSequenceNumber + 1) {
					// unexpected sequence number. if a pending message reader is available, ask for those ops
					if (this.pendingMessageReader !== undefined) {
						// eslint-disable-next-line @typescript-eslint/restrict-plus-operands
						const from = lastProtocolHandlerSequenceNumber + 1;
						const to = value.operation.sequenceNumber - 1;
						const additionalPendingMessages =
							await this.pendingMessageReader.readMessages(from, to);
						for (const additionalPendingMessage of additionalPendingMessages) {
							this.pendingMessages.push(additionalPendingMessage);
						}
					} else {
						const errorMsg =
							`Invalid message sequence number.` +
							`Current message @${value.operation.sequenceNumber}.` +
							`ProtocolHandler @${lastProtocolHandlerSequenceNumber}`;
						throw new Error(errorMsg);
					}
				}

				// Add the message to the list of pending for this document and those that we need
				// to include in the checkpoint
				this.pendingMessages.push(value.operation);

				if (this.serviceConfiguration.scribe.enablePendingCheckpointMessages) {
					this.pendingCheckpointMessages.push(value);
				}

				// Update the current sequence and min sequence numbers
				const msnChanged = this.minSequenceNumber !== value.operation.minimumSequenceNumber;
				this.sequenceNumber = value.operation.sequenceNumber;
				this.minSequenceNumber = value.operation.minimumSequenceNumber;

				if (msnChanged) {
					// When the MSN changes we can process up to it to save space
					this.processFromPending(this.minSequenceNumber, message);
				}

				this.clearCache = false;

				// skip summarize messages that deli already acked
				if (
					value.operation.type === MessageType.Summarize &&
					!(value.operation.serverMetadata as IServerMetadata | undefined)?.deliAcked
				) {
					// ensure the client is requesting a summary for a state that scribe can achieve
					// the clients summary state (ref seq num) must be at least as high as scribes (protocolHandler.sequenceNumber)
					if (
						!this.summaryWriter.isExternal ||
						value.operation.referenceSequenceNumber >=
							this.protocolHandler.sequenceNumber
					) {
						// Process up to the summary op ref seq to get the protocol state at the summary op.
						// Capture state first in case the summary is nacked.
						const prevState = {
							protocolState: this.protocolHandler.getProtocolState(),
							pendingOps: this.pendingMessages.toArray(),
						};
						this.processFromPending(value.operation.referenceSequenceNumber, message);

						// When external, only process the op if the protocol state advances.
						// This eliminates the corner case where we have
						// already captured this summary and are processing this message due to a replay of the stream.
						if (this.protocolHead < this.protocolHandler.sequenceNumber) {
							try {
								const scribeCheckpoint = this.generateScribeCheckpoint(
									this.lastOffset,
								);
								const operation =
									value.operation as ISequencedDocumentAugmentedMessage;
								const summaryResponse = await this.summaryWriter.writeClientSummary(
									operation,
									this.lastClientSummaryHead,
									scribeCheckpoint,
									this.pendingCheckpointMessages.toArray(),
									this.isEphemeralContainer,
								);

								// This block is only executed if the writer is not external. For an external writer,
								// (e.g., job queue) the responsibility of sending ops to the stream is up to the
								// external writer.
								if (!this.summaryWriter.isExternal) {
									// On a successful write, send an ack message to clients and a control message to deli.
									// Otherwise send a nack and revert the protocol state back to pre summary state.
									if (summaryResponse.status) {
										await this.sendSummaryAck(
											summaryResponse.message as ISummaryAck,
										);
										await this.sendSummaryConfirmationMessage(
											operation.sequenceNumber,
											true,
											false,
										);
										this.updateProtocolHead(
											this.protocolHandler.sequenceNumber,
										);
										this.updateLastSummarySequenceNumber(
											this.protocolHandler.sequenceNumber,
										);
										const summaryResult = `Client summary success @${value.operation.sequenceNumber}`;
										this.context.log?.info(summaryResult, {
											messageMetaData: {
												documentId: this.documentId,
												tenantId: this.tenantId,
											},
										});
										Lumberjack.info(
											summaryResult,
											getLumberBaseProperties(this.documentId, this.tenantId),
										);
									} else {
										const nackMessage = summaryResponse.message as ISummaryNack;
										await this.sendSummaryNack(nackMessage);
										const errorMsg =
											`Client summary failure @${value.operation.sequenceNumber}. ` +
											`Error: ${nackMessage.message}`;
										this.context.log?.error(errorMsg, {
											messageMetaData: {
												documentId: this.documentId,
												tenantId: this.tenantId,
											},
										});
										Lumberjack.error(
											errorMsg,
											getLumberBaseProperties(this.documentId, this.tenantId),
										);
										this.revertProtocolState(
											prevState.protocolState,
											prevState.pendingOps,
										);
									}
								}
							} catch (ex) {
								const errorMsg = `Client summary failure @${value.operation.sequenceNumber}`;
								this.context.log?.error(`${errorMsg} Exception: ${inspect(ex)}`);
								Lumberjack.error(
									errorMsg,
									getLumberBaseProperties(this.documentId, this.tenantId),
									ex,
								);
								this.revertProtocolState(
									prevState.protocolState,
									prevState.pendingOps,
								);
								// If this flag is set, we should ignore any storage specific error and move forward
								// to process the next message.
								if (this.serviceConfiguration.scribe.ignoreStorageException) {
									await this.sendSummaryNack({
										message: "Failed to summarize the document.",
										summaryProposal: {
											summarySequenceNumber: value.operation.sequenceNumber,
										},
									});
								} else {
									throw ex;
								}
							}
						}
					}
					// eslint-disable-next-line unicorn/prefer-switch
				} else if (value.operation.type === MessageType.NoClient) {
					assert(
						value.operation.referenceSequenceNumber === value.operation.sequenceNumber,
						`${value.operation.referenceSequenceNumber} != ${value.operation.sequenceNumber}`,
					);
					assert(
						value.operation.minimumSequenceNumber === value.operation.sequenceNumber,
						`${value.operation.minimumSequenceNumber} != ${value.operation.sequenceNumber}`,
					);
					this.noActiveClients = true;
					this.globalCheckpointOnly = true;
					const enableServiceSummaryForTenant =
						this.disableTransientTenantFiltering ||
						!this.transientTenants.has(this.tenantId);

					if (
						this.serviceConfiguration.scribe.generateServiceSummary &&
						!this.isEphemeralContainer &&
						enableServiceSummaryForTenant
					) {
						const operation = value.operation as ISequencedDocumentAugmentedMessage;
						const scribeCheckpoint = this.generateScribeCheckpoint(this.lastOffset);
						try {
							const summaryResponse = await this.summaryWriter.writeServiceSummary(
								operation,
								this.protocolHead,
								scribeCheckpoint,
								this.pendingCheckpointMessages.toArray(),
							);

							if (summaryResponse) {
								if (
									this.serviceConfiguration.scribe.clearCacheAfterServiceSummary
								) {
									this.clearCache = true;
								}
								await this.sendSummaryConfirmationMessage(
									operation.sequenceNumber,
									false,
									this.serviceConfiguration.scribe.clearCacheAfterServiceSummary,
								);
								this.updateLastSummarySequenceNumber(operation.sequenceNumber);
								// Add service summary handle to validParentSummaries so that SummaryWriter knows it is a valid
								// alternate parent summary handle. Otherwise only lastClientSummaryHead and latest service summary are accepted.
								this.updateValidParentSummaries(summaryResponse);
								const summaryResult = `Service summary success @${operation.sequenceNumber}`;
								this.context.log?.info(summaryResult, {
									messageMetaData: {
										documentId: this.documentId,
										tenantId: this.tenantId,
									},
								});
								Lumberjack.info(
									summaryResult,
									getLumberBaseProperties(this.documentId, this.tenantId),
								);
							}
						} catch (ex) {
							const errorMsg = `Service summary failure @${operation.sequenceNumber}`;

							// If this flag is set, we should ignore any storage speciic error and move forward
							// to process the next message.
							if (this.serviceConfiguration.scribe.ignoreStorageException) {
								this.context.log?.error(errorMsg, {
									messageMetaData: {
										documentId: this.documentId,
										tenantId: this.tenantId,
									},
								});
								Lumberjack.error(
									errorMsg,
									getLumberBaseProperties(this.documentId, this.tenantId),
									ex,
								);
							} else {
								// Throwing error here leads to document being marked as corrupt in document partition
								this.isDocumentCorrupt = true;
								throw ex;
							}
						}
					}
				} else if (value.operation.type === MessageType.SummaryAck) {
					const operation = value.operation as ISequencedDocumentSystemMessage;
					const content: ISummaryAck = operation.data
						? JSON.parse(operation.data)
						: operation.contents;
					this.lastClientSummaryHead = content.handle;
					// Similar to lastClientSummaryHead, only reset validParentSummaries to undefined
					// once a new official client summary ack is receieved.
					// It will be updated to an array if/when summary handles are added.
					this.validParentSummaries = undefined;
					// An external summary writer can only update the protocolHead when the ack is sequenced
					// back to the stream.
					if (this.summaryWriter.isExternal) {
						this.updateProtocolHead(content.summaryProposal.summarySequenceNumber);
						this.updateLastSummarySequenceNumber(
							content.summaryProposal.summarySequenceNumber,
						);
					}
				} else if (value.operation.type === MessageType.ClientJoin) {
					if (this.localCheckpointEnabled) {
						this.globalCheckpointOnly = false;
					}
				}
			}
		}

		// Create the checkpoint
		this.updateCheckpointMessages(message);
		this.checkpointInfo.rawMessagesSinceCheckpoint++;

		if (this.noActiveClients) {
			if (this.localCheckpointEnabled) {
				this.globalCheckpointOnly = true;
			}
			this.prepareCheckpoint(message, CheckpointReason.NoClients);
			this.noActiveClients = false;
		} else {
			const checkpointReason = this.getCheckpointReason();
			if (checkpointReason !== undefined) {
				// checkpoint the current up-to-date state
				this.prepareCheckpoint(message, checkpointReason);
			} else {
				this.updateCheckpointIdleTimer();
			}
		}
	}

	public prepareCheckpoint(
		message: IQueuedMessage,
		checkpointReason: CheckpointReason,
		skipKafkaCheckpoint?: boolean,
	) {
		// Get checkpoint context
		const checkpoint = this.generateScribeCheckpoint(message.offset);
		this.updateCheckpointMessages(message);

		// write the checkpoint with the current up-to-date state
		this.checkpoint(checkpointReason);
		this.checkpointCore(checkpoint, message, this.clearCache, skipKafkaCheckpoint);
		this.lastOffset = message.offset;
		const reason = CheckpointReason[checkpointReason];
		const checkpointResult = `Writing checkpoint. Reason: ${reason}`;
		const lumberjackProperties = {
			...getLumberBaseProperties(this.documentId, this.tenantId),
			checkpointReason: reason,
			lastOffset: this.lastOffset,
			scribeCheckpointOffset: this.checkpointInfo.currentCheckpointMessage?.offset,
			scribeCheckpointPartition: this.checkpointInfo.currentCheckpointMessage?.partition,
			kafkaCheckpointOffset: this.checkpointInfo.currentKafkaCheckpointMessage?.offset,
			kafkaCheckpointPartition: this.checkpointInfo.currentKafkaCheckpointMessage?.partition,
			clientCount: checkpoint.protocolState.members.length,
			clients: getClientIds(checkpoint.protocolState, 5),
			localCheckpointEnabled: this.localCheckpointEnabled,
			globalCheckpointOnly: this.globalCheckpointOnly,
			localCheckpoint: this.localCheckpointEnabled && !this.globalCheckpointOnly,
		};
		Lumberjack.info(checkpointResult, lumberjackProperties);
	}

	public close(closeType: LambdaCloseType) {
		this.logScribeSessionMetrics(closeType);

		this.closed = true;
		this.protocolHandler.close();
	}

	private logScribeSessionMetrics(closeType: LambdaCloseType) {
		if (this.scribeSessionMetric?.isCompleted()) {
			Lumberjack.info(
				"Scribe session metric already completed. Creating a new one.",
				getLumberBaseProperties(this.documentId, this.tenantId),
			);
			const isEphemeralContainer: boolean =
				this.scribeSessionMetric?.properties.get(CommonProperties.isEphemeralContainer) ??
				false;
			this.scribeSessionMetric = createSessionMetric(
				this.tenantId,
				this.documentId,
				LumberEventName.ScribeSessionResult,
				this.serviceConfiguration,
			);
			this.scribeSessionMetric?.setProperty(
				CommonProperties.isEphemeralContainer,
				isEphemeralContainer,
			);
		}

		logCommonSessionEndMetrics(
			this.context as DocumentContext,
			closeType,
			this.scribeSessionMetric,
			this.sequenceNumber,
			this.protocolHead,
			undefined,
		);
	}

	// Advances the protocol state up to 'target' sequence number. Having an exception while running this code
	// is crucial and the document is essentially corrupted at this point. We should start logging this and
	// have a better understanding of all failure modes.
	private processFromPending(target: number, queuedMessage: IQueuedMessage) {
		while (
			this.pendingMessages.length > 0 &&
			// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
			this.pendingMessages.peekFront()!.sequenceNumber <= target
		) {
			// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
			const message = this.pendingMessages.shift()!;
			try {
				if (
					message.contents &&
					typeof message.contents === "string" &&
					message.type !== MessageType.ClientLeave
				) {
					const clonedMessage = _.cloneDeep(message);
					clonedMessage.contents = JSON.parse(clonedMessage.contents as string);
					this.protocolHandler.processMessage(clonedMessage, false);
				} else {
					if (message.type === MessageType.ClientLeave) {
						const systemLeaveMessage = message as ISequencedDocumentSystemMessage;
						const clientId = JSON.parse(systemLeaveMessage.data) as string;
						Lumberjack.info(
							`Removing client from quorum: ${clientId}`,
							getLumberBaseProperties(this.documentId, this.tenantId),
						);
					}
					this.protocolHandler.processMessage(message, false);
				}
			} catch (error) {
				// We should mark the document as corrupt here
				this.markDocumentAsCorrupt(queuedMessage);
				this.context.log?.error(`Protocol error ${error}`, {
					messageMetaData: {
						documentId: this.documentId,
						tenantId: this.tenantId,
					},
				});
				Lumberjack.error(
					`Protocol error`,
					getLumberBaseProperties(this.documentId, this.tenantId),
					error,
				);
				throw new Error(`Protocol error ${error} for ${this.documentId} ${this.tenantId}`);
			}
		}
	}

	private markDocumentAsCorrupt(message: IQueuedMessage) {
		this.isDocumentCorrupt = true;
		this.prepareCheckpoint(message, CheckpointReason.MarkAsCorrupt, this.isDocumentCorrupt);
	}

	private revertProtocolState(
		protocolState: IProtocolState,
		pendingOps: ISequencedDocumentMessage[],
	) {
		this.protocolHandler = initializeProtocol(protocolState);
		this.pendingMessages = new Deque(pendingOps);
	}

	private generateScribeCheckpoint(logOffset: number): IScribe {
		const protocolState = this.protocolHandler.getProtocolState();
		const checkpoint: IScribe = {
			lastSummarySequenceNumber: this.lastSummarySequenceNumber,
			lastClientSummaryHead: this.lastClientSummaryHead,
			logOffset,
			minimumSequenceNumber: this.minSequenceNumber,
			protocolState,
			sequenceNumber: this.sequenceNumber,
			validParentSummaries: this.validParentSummaries,
			isCorrupt: this.isDocumentCorrupt,
		};
		return checkpoint;
	}

	private checkpointCore(
		checkpoint: IScribe,
		queuedMessage: IQueuedMessage,
		clearCache: boolean,
		skipKafkaCheckpoint: boolean = false,
	) {
		if (this.closed) {
			return;
		}

		if (this.pendingP) {
			this.pendingCheckpointScribe = checkpoint;
			this.pendingCheckpointOffset = queuedMessage;
			return;
		}
		let databaseCheckpointFailed = false;

		this.pendingP = (
			clearCache
				? this.checkpointManager.delete(this.protocolHead, true)
				: this.writeCheckpoint(checkpoint).catch((error) => {
						databaseCheckpointFailed = true;
						Lumberjack.error(
							`Error writing database checkpoint.`,
							getLumberBaseProperties(this.documentId, this.tenantId),
							error,
						);
				  })
		)
			.then(() => {
				this.pendingP = undefined;
				if (!skipKafkaCheckpoint && !databaseCheckpointFailed) {
					this.context.checkpoint(queuedMessage, this.restartOnCheckpointFailure);
				} else if (databaseCheckpointFailed) {
					Lumberjack.info(
						`Skipping kafka checkpoint due to database checkpoint failure.`,
						getLumberBaseProperties(this.documentId, this.tenantId),
					);
					databaseCheckpointFailed = false;
				}
				const pendingScribe = this.pendingCheckpointScribe;
				const pendingOffset = this.pendingCheckpointOffset;
				if (pendingScribe && pendingOffset) {
					this.pendingCheckpointScribe = undefined;
					this.pendingCheckpointOffset = undefined;
					this.checkpointCore(pendingScribe, pendingOffset, clearCache);
				}
			})
			.catch((error) => {
				const message = "Checkpoint error";
				Lumberjack.error(
					message,
					getLumberBaseProperties(this.documentId, this.tenantId),
					error,
				);
			});
	}

	private async writeCheckpoint(checkpoint: IScribe) {
		const inserts = this.pendingCheckpointMessages.toArray();
		await this.checkpointManager.write(
			checkpoint,
			this.protocolHead,
			inserts,
			this.noActiveClients,
			this.globalCheckpointOnly,
			this.isDocumentCorrupt,
		);
		if (inserts.length > 0) {
			// Since we are storing logTails with every summary, we need to make sure that messages are either in DB
			// or in memory. In other words, we can only remove messages from memory once there is a copy in the DB
			const lastInsertedSeqNumber = inserts[inserts.length - 1].operation.sequenceNumber;
			while (
				this.pendingCheckpointMessages.length > 0 &&
				// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
				this.pendingCheckpointMessages.peekFront()!.operation.sequenceNumber <=
					lastInsertedSeqNumber
			) {
				this.pendingCheckpointMessages.removeFront();
			}
		}
	}

	/**
	 * Protocol head is the sequence number of the last summary
	 * This method updates the protocol head to the new summary sequence number
	 * @param protocolHead - The sequence number of the new summary
	 */
	private updateProtocolHead(protocolHead: number) {
		this.protocolHead = protocolHead;
	}

	/**
	 * lastSummarySequenceNumber tracks the sequence number that was part of the latest summary
	 * This method updates it to the sequence number that was part of the latest summary
	 * @param summarySequenceNumber - The sequence number of the operation that was part of the latest summary
	 */
	private updateLastSummarySequenceNumber(summarySequenceNumber: number) {
		this.lastSummarySequenceNumber = summarySequenceNumber;
	}

	/**
	 * validParentSummaries tracks summary handles for service summaries that have been written since the latest client summary.
	 * @param summaryHandle - The handle for a service summary that occurred after latest client summary.
	 */
	private updateValidParentSummaries(summaryHandle: string) {
		if (this.validParentSummaries === undefined) {
			this.validParentSummaries = [];
		}
		this.validParentSummaries.push(summaryHandle);
	}

	private async sendSummaryAck(contents: ISummaryAck) {
		const operation: IDocumentSystemMessage = {
			clientSequenceNumber: -1,
			contents,
			data: JSON.stringify(contents),
			referenceSequenceNumber: -1,
			traces: this.serviceConfiguration.enableTraces ? [] : undefined,
			type: MessageType.SummaryAck,
		};

		return sendToDeli(this.tenantId, this.documentId, this.producer, operation);
	}

	private async sendSummaryNack(contents: ISummaryNack) {
		const operation: IDocumentSystemMessage = {
			clientSequenceNumber: -1,
			contents,
			data: JSON.stringify(contents),
			referenceSequenceNumber: -1,
			traces: this.serviceConfiguration.enableTraces ? [] : undefined,
			type: MessageType.SummaryNack,
		};

		return sendToDeli(this.tenantId, this.documentId, this.producer, operation);
	}

	// Sends a confirmation back to deli as a signal to update its DSN. Note that 'durableSequenceNumber (dsn)'
	// runs ahead of last summary sequence number (protocolHead). The purpose of dsn is to inform deli about permanent
	// storage so that it can hydrate its state after a failure. The client's are still reponsible for fetching ops
	// from protocolHead to dsn.
	private async sendSummaryConfirmationMessage(
		durableSequenceNumber: number,
		isClientSummary: boolean,
		clearCache: boolean,
	) {
		const controlMessage: IControlMessage = {
			type: ControlMessageType.UpdateDSN,
			contents: {
				durableSequenceNumber,
				isClientSummary,
				clearCache,
			},
		};

		const operation: IDocumentSystemMessage = {
			clientSequenceNumber: -1,
			contents: null,
			data: JSON.stringify(controlMessage),
			referenceSequenceNumber: -1,
			traces: this.serviceConfiguration.enableTraces ? [] : undefined,
			type: MessageType.Control,
		};

		return sendToDeli(this.tenantId, this.documentId, this.producer, operation);
	}

	private setStateFromCheckpoint(scribe: IScribe) {
		this.sequenceNumber = scribe.sequenceNumber;
		this.minSequenceNumber = scribe.minimumSequenceNumber;
		this.lastClientSummaryHead = scribe.lastClientSummaryHead;
		this.lastSummarySequenceNumber = scribe.lastSummarySequenceNumber;
		this.validParentSummaries = scribe.validParentSummaries;
		this.isDocumentCorrupt = scribe.isCorrupt;
	}

	private updateCheckpointMessages(message: IQueuedMessage) {
		// updates scribe checkpoint message
		this.checkpointInfo.currentCheckpointMessage = message;

		if (this.noActiveClients) {
			this.checkpointInfo.nextKafkaCheckpointMessage = undefined;
			this.checkpointInfo.currentKafkaCheckpointMessage = message;
		} else {
			// Keeps Kafka checkpoint behind by 1 message (is this necessary?)
			const kafkaCheckpointMessage = this.checkpointInfo.nextKafkaCheckpointMessage;
			this.checkpointInfo.nextKafkaCheckpointMessage = message;
			this.checkpointInfo.currentKafkaCheckpointMessage = kafkaCheckpointMessage;
		}
	}

	// Determines checkpoint reason based on some Heuristics

	private getCheckpointReason(): CheckpointReason | undefined {
		const checkpointHeuristics = this.serviceConfiguration.scribe.checkpointHeuristics;

		if (!checkpointHeuristics.enable) {
			// always checkpoint since heuristics are disabled
			return CheckpointReason.EveryMessage;
		}

		if (this.checkpointInfo.rawMessagesSinceCheckpoint >= checkpointHeuristics.maxMessages) {
			// exceeded max messages since last checkpoint
			return CheckpointReason.MaxMessages;
		}

		if (Date.now() - this.checkpointInfo.lastCheckpointTime >= checkpointHeuristics.maxTime) {
			// exceeded max time since last checkpoint
			return CheckpointReason.MaxTime;
		}

		return undefined;
	}

	private clearCheckpointIdleTimer() {
		if (this.checkpointInfo.idleTimer !== undefined) {
			clearTimeout(this.checkpointInfo.idleTimer);
			this.checkpointInfo.idleTimer = undefined;
		}
	}

	private checkpoint(reason: CheckpointReason) {
		this.clearCheckpointIdleTimer();
		this.checkpointInfo.lastCheckpointTime = Date.now();
		this.checkpointInfo.rawMessagesSinceCheckpoint = 0;
	}

	private updateCheckpointIdleTimer() {
		this.clearCheckpointIdleTimer();

		const initialScribeCheckpointMessage = this.checkpointInfo.currentCheckpointMessage;

		this.checkpointInfo.idleTimer = setTimeout(() => {
			this.checkpointInfo.idleTimer = undefined;

			// verify that the current scribe message matches the message that started this timer
			// same implementation as in Deli
			if (
				initialScribeCheckpointMessage === this.checkpointInfo.currentCheckpointMessage &&
				!this.isDocumentCorrupt
			) {
				this.checkpoint(CheckpointReason.IdleTime);
				if (initialScribeCheckpointMessage) {
					const checkpoint = this.generateScribeCheckpoint(
						initialScribeCheckpointMessage.offset,
					);
					this.checkpointCore(
						checkpoint,
						initialScribeCheckpointMessage,
						this.clearCache,
					);
					const checkpointResult = `Writing checkpoint. Reason: IdleTime`;
					const lumberjackProperties = {
						...getLumberBaseProperties(this.documentId, this.tenantId),
						checkpointReason: "IdleTime",
						lastOffset: initialScribeCheckpointMessage.offset,
						scribeCheckpointOffset:
							this.checkpointInfo.currentCheckpointMessage?.offset,
						scribeCheckpointPartition:
							this.checkpointInfo.currentCheckpointMessage?.partition,
						kafkaCheckpointOffset:
							this.checkpointInfo.currentKafkaCheckpointMessage?.offset,
						kafkaCheckpointPartition:
							this.checkpointInfo.currentKafkaCheckpointMessage?.partition,
						clientCount: checkpoint.protocolState.members.length,
						clients: getClientIds(checkpoint.protocolState, 5),
						localCheckpointEnabled: this.localCheckpointEnabled,
						globalCheckpointOnly: this.globalCheckpointOnly,
						localCheckpoint: this.localCheckpointEnabled && !this.globalCheckpointOnly,
					};
					Lumberjack.info(checkpointResult, lumberjackProperties);
				}
			}
		}, this.serviceConfiguration.scribe.checkpointHeuristics.idleTime);
	}
}
