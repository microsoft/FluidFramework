/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	ISequencedDocumentAugmentedMessage,
	IBranchOrigin,
	IClientJoin,
	IDocumentSystemMessage,
	ISequencedDocumentMessage,
	ISequencedDocumentSystemMessage,
	ITrace,
	MessageType,
	NackErrorType,
	ScopeType,
	ISignalMessage,
	ISummaryAck,
	ISummaryContent,
	IDocumentMessage,
} from "@fluidframework/protocol-definitions";
import {
	canSummarize,
	defaultHash,
	getNextHash,
	isNetworkError,
} from "@fluidframework/server-services-client";
import {
	ControlMessageType,
	extractBoxcar,
	IClientSequenceNumber,
	IContext,
	IControlMessage,
	IDeliState,
	IDisableNackMessagesControlMessageContents,
	IMessage,
	INackMessage,
	ITicketedSignalMessage,
	IPartitionLambda,
	IProducer,
	IRawOperationMessage,
	ISequencedOperationMessage,
	IServiceConfiguration,
	NackMessagesType,
	NackOperationType,
	RawOperationType,
	SequencedOperationType,
	IQueuedMessage,
	INackMessagesControlMessageContents,
	IUpdateDSNControlMessageContents,
	LambdaCloseType,
	SignalOperationType,
	ITicketedMessage,
	IExtendClientControlMessageContents,
	ISequencedSignalClient,
	IClientManager,
	ICheckpointService,
} from "@fluidframework/server-services-core";
import {
	CommonProperties,
	getLumberBaseProperties,
	Lumber,
	LumberEventName,
	Lumberjack,
} from "@fluidframework/server-services-telemetry";
import { DocumentContext } from "@fluidframework/server-lambdas-driver";
import { TypedEventEmitter } from "@fluidframework/common-utils";
import { IEvent } from "../events";
import {
	logCommonSessionEndMetrics,
	createSessionMetric,
	createRoomJoinMessage,
	createRoomLeaveMessage,
	CheckpointReason,
	DocumentCheckpointManager,
	IServerMetadata,
} from "../utils";
import { CheckpointContext } from "./checkpointContext";
import { ClientSequenceNumberManager } from "./clientSeqManager";
import { IDeliCheckpointManager, ICheckpointParams } from "./checkpointManager";

enum IncomingMessageOrder {
	Duplicate,
	Gap,
	ConsecutiveOrSystem,
}

enum SendType {
	Immediate,
	Later,
	Never,
}

enum InstructionType {
	ClearCache,
	NoOp,
}

enum TicketType {
	Sequenced,
	Nack,
	Signal,
}

type TicketedMessageOutput =
	| ISequencedDocumentMessageOutput
	| INackMessageOutput
	| ISignalMessageOutput;

interface IBaseTicketedMessage<T> {
	ticketType: TicketType;
	message: T;
	instruction?: InstructionType;
}

interface ISequencedDocumentMessageOutput extends IBaseTicketedMessage<ISequencedDocumentMessage> {
	ticketType: TicketType.Sequenced;
	send: SendType;
	type: string;

	timestamp: number;
	msn: number;
}

interface INackMessageOutput extends IBaseTicketedMessage<INackMessage> {
	ticketType: TicketType.Nack;
}

interface ISignalMessageOutput extends IBaseTicketedMessage<ITicketedSignalMessage> {
	ticketType: TicketType.Signal;
}

/**
 * Used for controlling op event logic
 */
interface IOpEvent {
	idleTimer?: any;
	maxTimer?: any;
	sequencedMessagesSinceLastOpEvent: number;
}

/**
 * @internal
 */
export enum OpEventType {
	/**
	 * There have been no sequenced ops for X milliseconds since the last message.
	 */
	Idle,

	/**
	 * More than X amount of ops have been ticketed since the emit.
	 */
	MaxOps,

	/**
	 * There was no previous emit for the last X milliseconds.
	 */
	MaxTime,

	/**
	 * Indicates the durable sequence number was updated.
	 */
	UpdatedDurableSequenceNumber,
}

/**
 * @internal
 */
export interface IDeliLambdaEvents extends IEvent {
	/**
	 * Emitted when certain op event heuristics are triggered.
	 */
	(
		event: "opEvent",
		listener: (
			type: OpEventType,
			sequenceNumber: number,
			sequencedMessagesSinceLastOpEvent: number,
		) => void,
	);

	/**
	 * Emitted when the lambda is updating the durable sequence number.
	 * This usually occurs via a control message after a summary was created.
	 */
	(event: "updatedDurableSequenceNumber", listener: (durableSequenceNumber: number) => void);

	/**
	 * Emitted when the lambda is updating a nack message
	 */
	(
		event: "updatedNackMessages",
		listener: (
			type: NackMessagesType,
			contents: INackMessagesControlMessageContents | undefined,
		) => void,
	);

	/**
	 * Emitted when the lambda receives a summarize message.
	 */
	(
		event: "summarizeMessage",
		listener: (summarizeMessage: ISequencedDocumentAugmentedMessage) => void,
	);

	/**
	 * Emitted when the lambda receives a custom control message.
	 */
	(event: "controlMessage", listener: (controlMessage: IControlMessage) => void);

	/**
	 * Emitted when the lambda is closing.
	 */
	(event: "close", listener: (type: LambdaCloseType) => void);

	/**
	 * NoClient message received
	 */
	(event: "noClient", listener: () => void);
}

/**
 * Check if the string is a service message type, which includes
 * MessageType.ClientJoin, MessageType.ClientLeave, MessageType.Control,
 * MessageType.NoClient, MessageType.SummaryAck, and MessageType.SummaryNack
 *
 * @param type - the type to check
 * @returns true if it is a system message type
 */
const isServiceMessageType = (type: string): boolean =>
	type === MessageType.ClientJoin ||
	type === MessageType.ClientLeave ||
	type === MessageType.Control ||
	type === MessageType.NoClient ||
	type === MessageType.SummaryAck ||
	type === MessageType.SummaryNack;

/**
 * @internal
 */
export class DeliLambda extends TypedEventEmitter<IDeliLambdaEvents> implements IPartitionLambda {
	private sequenceNumber: number;
	private signalClientConnectionNumber: number;
	private durableSequenceNumber: number;

	private logOffset: number;

	// Client sequence number mapping
	private readonly clientSeqManager = new ClientSequenceNumberManager();
	private minimumSequenceNumber = 0;
	private readonly checkpointContext: CheckpointContext;
	private lastSendP = Promise.resolve();
	private lastNoClientP = Promise.resolve();
	private lastSentMSN = 0;
	private lastHash: string;
	private lastInstruction: InstructionType | undefined = InstructionType.NoOp;
	private lastMessageType: string | undefined;

	private activityIdleTimer: any;
	private readClientIdleTimer: any;
	private noopEvent: any;

	/**
	 * Used for controlling op event logic
	 */
	private readonly opEvent: IOpEvent = { sequencedMessagesSinceLastOpEvent: 0 };

	/**
	 * Used for controlling checkpoint logic
	 */
	private readonly documentCheckpointManager = new DocumentCheckpointManager();

	private globalCheckpointOnly: boolean;

	private readonly localCheckpointEnabled: boolean;

	private recievedNoClientOp: boolean = false;

	private closed: boolean = false;

	// mapping of enabled nack message types. messages will be nacked based on the provided info
	private readonly nackMessages: Map<NackMessagesType, INackMessagesControlMessageContents>;

	// Session level properties
	private serviceSummaryGenerated: boolean = false;

	constructor(
		private readonly context: IContext,
		private readonly tenantId: string,
		private readonly documentId: string,
		readonly lastCheckpoint: IDeliState,
		checkpointManager: IDeliCheckpointManager,
		private readonly clientManager: IClientManager | undefined,
		private readonly deltasProducer: IProducer,
		private readonly signalsProducer: IProducer | undefined,
		private readonly rawDeltasProducer: IProducer,
		private readonly serviceConfiguration: IServiceConfiguration,
		private sessionMetric: Lumber<LumberEventName.SessionResult> | undefined,
		private readonly checkpointService: ICheckpointService | undefined,
		private readonly sequencedSignalClients: Map<string, ISequencedSignalClient> = new Map(),
	) {
		super();

		// Instantiate existing clients
		if (lastCheckpoint.clients) {
			for (const client of lastCheckpoint.clients) {
				if (client.clientId) {
					this.clientSeqManager.upsertClient(
						client.clientId,
						client.clientSequenceNumber,
						client.referenceSequenceNumber,
						client.lastUpdate,
						client.canEvict,
						client.scopes,
						client.nack,
						client.serverMetadata,
					);
				}
			}
		}

		// Initialize counting context
		this.sequenceNumber = lastCheckpoint.sequenceNumber;
		this.signalClientConnectionNumber = lastCheckpoint.signalClientConnectionNumber ?? 0;
		this.lastHash = lastCheckpoint.expHash1 ?? defaultHash;
		this.durableSequenceNumber = lastCheckpoint.durableSequenceNumber;
		this.lastSentMSN = lastCheckpoint.lastSentMSN ?? 0;
		this.logOffset = lastCheckpoint.logOffset;

		if (lastCheckpoint.nackMessages) {
			if (Array.isArray(lastCheckpoint.nackMessages)) {
				this.nackMessages = new Map(lastCheckpoint.nackMessages);
			} else {
				// backwards compat. nackMessages is a INackMessagesControlMessageContents
				this.nackMessages = new Map();

				// extra check for very old nack messages
				const identifier = lastCheckpoint.nackMessages.identifier;
				if (identifier !== undefined) {
					this.nackMessages.set(identifier, lastCheckpoint.nackMessages);
				}
			}
		} else {
			this.nackMessages = new Map();
		}

		const msn = this.clientSeqManager.getMinimumSequenceNumber();
		this.documentCheckpointManager.setNoActiveClients(msn === -1);
		this.minimumSequenceNumber = this.documentCheckpointManager.getNoActiveClients()
			? this.sequenceNumber
			: msn;

		if (this.serviceConfiguration.deli.summaryNackMessages.checkOnStartup) {
			this.checkNackMessagesState();
		}

		this.checkpointContext = new CheckpointContext(
			this.tenantId,
			this.documentId,
			checkpointManager,
			context,
			this.checkpointService,
		);

		this.localCheckpointEnabled = this.checkpointService?.getLocalCheckpointEnabled() ?? false;

		this.globalCheckpointOnly = this.localCheckpointEnabled ? false : true;

		// start the activity idle timer when created
		this.setActivityIdleTimer();

		this.setReadClientIdleTimer();

		if (this.serviceConfiguration.deli.opEvent.enable) {
			this.updateOpMaxTimeTimer();

			/**
			 * Deli's opEvent system is supposed to tell us when it's time to post ops for the session.
			 * It sends an "opEvent" event based heuristics like idle / max time / max ops.
			 * There's an edge case though. Suppose the following:
			 * 1. Server A created a deli for the session, consumes 100 kafka messages, and sequences 100 ops.
			 * 2. Within 5 seconds of sequencing those ops,
			 * Server A's deli saves a checkpoint (it remembers it sequenced those 100 ops)
			 * 3. Within a second of that checkpoint, the Kafka partition is rebalanced.
			 * 4. Server B now creates a deli for that session and it consumes those same 100 kafka messages.
			 * 4a. Server B's deli instance is smart enough to detect that those 100 kafka messages were already
			 * processed (due to the checkpoint created in #2) so it ignores them (the first if statement in handler).
			 *
			 * The above flow is a problem because the opEvent logic is not going to trigger since
			 * no messages were sequenced by this deli.
			 *
			 * Deli should be smart and check if it hasn't yet sent an opEvent for messages that
			 * were not durably stored.
			 */
			if (this.sequenceNumber > this.durableSequenceNumber) {
				/**
				 * This makes it so the next time deli checks for a "maxTime" opEvent,
				 * it will fire the event since sequencedMessagesSinceLastOpEvent \> 0.
				 */
				this.opEvent.sequencedMessagesSinceLastOpEvent =
					this.sequenceNumber - this.durableSequenceNumber;
			}
		}

		if (this.serviceConfiguration.deli.checkForIdleClientsOnStartup) {
			/**
			 * Instruct deli to check for idle clients on startup. Why do we want to do this?
			 *
			 * Suppose the following:
			 * 1. Deli starts up and there is 1 write client and it
			 * consumes 1 message it has already previouly consumed.
			 * 2. Deli is closed due to a rebalance 2 minutes later.
			 * 3. Suppose that deli keeps rebalancing every 2 minutes indefinitely.
			 *
			 * Deli is configured to checkpoint 1 message behind the head while there is a client in the session.
			 * This will cause the kafka partition to never get a new checkpoint because it's in this bad loop.
			 * Never checkpointing could eventually lead to messages expiring from Kafka (data loss/corruption).
			 *
			 * We can recover from this loop if we check for idle clients on startup and insert a leave message
			 * for that 1 write client (who is now definitely expired). It would end up making deli checkpoint properly.
			 */
			this.checkIdleWriteClients(Date.now());
		}
	}

	/**
	 * {@inheritDoc IPartitionLambda.handler}
	 */
	public handler(rawMessage: IQueuedMessage): undefined {
		// In cases where we are reprocessing messages we have already checkpointed exit early
		if (this.logOffset !== undefined && rawMessage.offset <= this.logOffset) {
			const reprocessOpsMetric = Lumberjack.newLumberMetric(LumberEventName.ReprocessOps);
			reprocessOpsMetric.setProperties({
				...getLumberBaseProperties(this.documentId, this.tenantId),
				[CommonProperties.isEphemeralContainer]:
					this.sessionMetric?.properties.get(CommonProperties.isEphemeralContainer) ??
					false,
				kafkaMessageOffset: rawMessage.offset,
				databaseLastOffset: this.logOffset,
			});

			this.documentCheckpointManager.updateCheckpointMessages(rawMessage);
			try {
				const currentMessage =
					this.documentCheckpointManager.getCheckpointInfo()
						.currentKafkaCheckpointMessage;
				if (
					currentMessage &&
					this.serviceConfiguration.deli.kafkaCheckpointOnReprocessingOp
				) {
					this.context.checkpoint(
						currentMessage,
						this.serviceConfiguration.deli.restartOnCheckpointFailure,
					);
				}
				reprocessOpsMetric.setProperty(
					"kafkaCheckpointOnReprocessingOp",
					this.serviceConfiguration.deli.kafkaCheckpointOnReprocessingOp,
				);
				reprocessOpsMetric.success(`Successfully reprocessed repeating ops.`);
			} catch (error) {
				reprocessOpsMetric.error(`Error while reprocessing ops.`, error);
			}
			return undefined;
		} else if (this.logOffset === undefined) {
			Lumberjack.error(
				`No value for logOffset`,
				getLumberBaseProperties(this.documentId, this.tenantId),
			);
		}

		this.logOffset = rawMessage.offset;

		let sequencedMessageCount = 0;

		// array of messages that should be produced to the deltas topic after processing
		const produceToDeltas: ITicketedMessage[] = [];

		const boxcar = extractBoxcar(rawMessage);

		for (const message of boxcar.contents) {
			// Ticket current message.
			const ticketedMessage = this.ticket(
				message,
				this.serviceConfiguration.enableTraces ? this.createTrace("start") : undefined,
			);

			// Return early if message is invalid
			if (!ticketedMessage) {
				continue;
			}

			this.lastInstruction = ticketedMessage.instruction;

			switch (ticketedMessage.ticketType) {
				case TicketType.Sequenced: {
					this.lastMessageType = ticketedMessage.type;
					if (ticketedMessage.type !== MessageType.ClientLeave) {
						// Check for idle write clients.
						this.checkIdleWriteClients(ticketedMessage.timestamp);
					}

					// Check for document inactivity.
					if (
						!(
							ticketedMessage.type === MessageType.NoClient ||
							ticketedMessage.type === MessageType.Control
						) &&
						this.documentCheckpointManager.getNoActiveClients() &&
						!this.serviceConfiguration.deli.disableNoClientMessage
					) {
						this.lastNoClientP = this.sendToRawDeltas(
							this.createOpMessage(MessageType.NoClient),
						).catch((error) => {
							const errorMsg = "Could not send no client message";
							this.context.log?.error(`${errorMsg}: ${JSON.stringify(error)}`, {
								messageMetaData: {
									documentId: this.documentId,
									tenantId: this.tenantId,
								},
							});
							Lumberjack.error(
								errorMsg,
								getLumberBaseProperties(this.documentId, this.tenantId),
								error,
							);
							this.context.error(error, {
								restart: true,
								tenantId: this.tenantId,
								documentId: this.documentId,
							});
						});
					}

					// Return early if sending is not required.
					if (ticketedMessage.send === SendType.Never) {
						continue;
					}

					// Return early but start a timer to create consolidated message.
					this.clearNoopConsolidationTimer();
					if (ticketedMessage.send === SendType.Later) {
						this.setNoopConsolidationTimer();
						continue;
					}

					const sequencedMessage = ticketedMessage.message;

					if (this.serviceConfiguration.deli.enableOpHashing) {
						this.lastHash = getNextHash(sequencedMessage, this.lastHash);
						sequencedMessage.expHash1 = this.lastHash;
					}

					if (sequencedMessage.type === MessageType.Summarize) {
						// note: this is being emitted before it's produced to the deltas topic
						// that lets event handlers alter the message if necessary
						this.emit(
							"summarizeMessage",
							sequencedMessage as ISequencedDocumentAugmentedMessage,
						);
					}

					const outgoingMessage: ISequencedOperationMessage = {
						type: SequencedOperationType,
						tenantId: this.tenantId,
						documentId: this.documentId,
						operation: sequencedMessage,
					};

					if (this.serviceConfiguration.deli.maintainBatches) {
						produceToDeltas.push(outgoingMessage);
					} else {
						this.produceMessage(this.deltasProducer, outgoingMessage);
					}

					sequencedMessageCount++;

					// Update the msn last sent
					this.lastSentMSN = ticketedMessage.msn;

					// create a signal for a write client if all the following are true:
					// 1. a signal producer is provided
					// 2. the sequenced op is a join or leave message
					// 3. enableWriteClientSignals is on or alfred told us to create a signal
					// #3 allows alfred to be in charge of enabling this functionality
					if (
						this.signalsProducer &&
						(sequencedMessage.type === MessageType.ClientJoin ||
							sequencedMessage.type === MessageType.ClientLeave) &&
						(this.serviceConfiguration.deli.enableWriteClientSignals ||
							(sequencedMessage.serverMetadata &&
								typeof sequencedMessage.serverMetadata === "object" &&
								(sequencedMessage.serverMetadata as IServerMetadata).createSignal))
					) {
						const dataContent = this.extractDataContent(
							message as IRawOperationMessage,
						);

						const signalMessage = this.createSignalMessage(
							message as IRawOperationMessage,
							sequencedMessage.sequenceNumber - 1,
							dataContent,
						);

						if (sequencedMessage.type === MessageType.ClientJoin) {
							this.addSequencedSignalClient(
								dataContent as IClientJoin,
								signalMessage,
							);
						} else {
							this.sequencedSignalClients.delete(dataContent);
						}

						this.produceMessage(this.signalsProducer, signalMessage.message);
					}

					break;
				}

				case TicketType.Nack: {
					if (this.serviceConfiguration.deli.maintainBatches) {
						produceToDeltas.push(ticketedMessage.message);
					} else {
						this.produceMessage(this.deltasProducer, ticketedMessage.message);
					}
					break;
				}

				case TicketType.Signal: {
					if (this.signalsProducer) {
						this.produceMessage(this.signalsProducer, ticketedMessage.message);
					}
					break;
				}

				default: {
					// ignore unknown types
					break;
				}
			}
		}

		if (produceToDeltas.length > 0) {
			// processing this boxcar resulted in one or more ticketed messages (sequenced ops or nacks)
			// produce them in a single boxcar to the deltas topic
			this.produceMessages(this.deltasProducer, produceToDeltas, rawMessage);
		}

		this.documentCheckpointManager.incrementRawMessageCounter();
		this.documentCheckpointManager.updateCheckpointMessages(rawMessage);

		if (this.lastMessageType === MessageType.ClientJoin) {
			this.recievedNoClientOp = false;
			if (this.localCheckpointEnabled) {
				this.globalCheckpointOnly = false;
			}
		} else if (this.lastMessageType === MessageType.NoClient) {
			this.recievedNoClientOp = true;
			if (this.localCheckpointEnabled) {
				this.globalCheckpointOnly = true;
			}

			// No clients in the session, since Deli get NoClient message it sends itself, emit no client event
			this.emit("noClient");
		}

		const checkpointReason = this.getCheckpointReason(this.lastMessageType);
		if (checkpointReason === undefined) {
			this.documentCheckpointManager.updateCheckpointIdleTimer(
				this.serviceConfiguration.deli.checkpointHeuristics.idleTime,
				this.idleTimeCheckpoint,
			);
		} else {
			// checkpoint the current up to date state
			this.checkpoint(checkpointReason, this.globalCheckpointOnly);
		}

		// Start a timer to check inactivity on the document. To trigger idle client leave message,
		// we send a noop back to alfred. The noop should trigger a client leave message if there are any.
		this.clearActivityIdleTimer();
		this.setActivityIdleTimer();

		if (sequencedMessageCount > 0) {
			// Check if Deli is over the max ops since last summary nack limit
			// Note: we are explicitly checking this after processing the entire boxcar in order to not break batches
			if (
				this.serviceConfiguration.deli.summaryNackMessages.enable &&
				!this.nackMessages.has(NackMessagesType.SummaryMaxOps)
			) {
				const opsSinceLastSummary = this.sequenceNumber - this.durableSequenceNumber;
				if (
					opsSinceLastSummary > this.serviceConfiguration.deli.summaryNackMessages.maxOps
				) {
					// this op brings us over the limit
					// start nacking non-system ops and ops that are submitted by non-summarizers
					this.updateNackMessages(NackMessagesType.SummaryMaxOps, {
						identifier: NackMessagesType.SummaryMaxOps,
						content: this.serviceConfiguration.deli.summaryNackMessages.nackContent,
						allowSystemMessages: true,
						allowedScopes: [ScopeType.SummaryWrite],
					});
				}
			}

			// Update the op event idle & max ops counter if ops were just sequenced
			if (this.serviceConfiguration.deli.opEvent.enable) {
				this.updateOpIdleTimer();

				const maxOps = this.serviceConfiguration.deli.opEvent.maxOps;
				if (maxOps !== undefined) {
					this.opEvent.sequencedMessagesSinceLastOpEvent += sequencedMessageCount;

					if (this.opEvent.sequencedMessagesSinceLastOpEvent > maxOps) {
						this.emitOpEvent(OpEventType.MaxOps);
					}
				}
			}
		}
	}

	public close(closeType: LambdaCloseType): void {
		this.closed = true;

		this.checkpointContext.close();

		this.clearActivityIdleTimer();
		this.clearReadClientIdleTimer();
		this.clearNoopConsolidationTimer();
		this.documentCheckpointManager.clearCheckpointIdleTimer();
		this.clearOpIdleTimer();
		this.clearOpMaxTimeTimer();

		this.emit("close", closeType);
		this.removeAllListeners();

		if (this.serviceConfiguration.enableLumberjack) {
			this.logSessionEndMetrics(closeType);
			if (!this.recievedNoClientOp && closeType === LambdaCloseType.ActivityTimeout) {
				Lumberjack.info(
					`Closing due to ActivityTimeout before NoClient op`,
					getLumberBaseProperties(this.documentId, this.tenantId),
				);
			}
		}
	}

	private produceMessage(producer: IProducer, message: ITicketedMessage): void {
		this.lastSendP = producer
			.send([message], message.tenantId, message.documentId)
			.catch((error) => {
				if (this.closed) {
					return;
				}

				const errorMsg = "Could not send message to producer";
				this.context.log?.error(`${errorMsg}: ${JSON.stringify(error)}`, {
					messageMetaData: {
						documentId: this.documentId,
						tenantId: this.tenantId,
					},
				});
				Lumberjack.error(
					errorMsg,
					getLumberBaseProperties(this.documentId, this.tenantId),
					error,
				);
				this.context.error(error, {
					restart: true,
					tenantId: this.tenantId,
					documentId: this.documentId,
				});
			});
	}

	private produceMessages(
		producer: IProducer,
		messages: ITicketedMessage[],
		rawMessage: IQueuedMessage,
	): void {
		this.lastSendP = producer.send(messages, this.tenantId, this.documentId).catch((error) => {
			if (this.closed) {
				return;
			}

			const errorMsg = `Could not send ${messages.length} messages to producer. offset: ${rawMessage.offset}`;
			this.context.log?.error(`${errorMsg}: ${JSON.stringify(error)}`, {
				messageMetaData: {
					documentId: this.documentId,
					tenantId: this.tenantId,
				},
			});
			Lumberjack.error(
				errorMsg,
				getLumberBaseProperties(this.documentId, this.tenantId),
				error,
			);

			let restart = true;
			let markAsCorrupt = false;

			if (isNetworkError(error) && error.code === 413) {
				// kafka message size too large
				restart = false;
				markAsCorrupt = true;
			}

			this.context.error(error, {
				restart,
				markAsCorrupt: markAsCorrupt ? rawMessage : undefined,
				tenantId: this.tenantId,
				documentId: this.documentId,
			});
		});
	}

	private logSessionEndMetrics(closeType: LambdaCloseType): void {
		if (this.sessionMetric?.isCompleted()) {
			Lumberjack.info(
				"Session metric already completed. Creating a new one.",
				getLumberBaseProperties(this.documentId, this.tenantId),
			);
			const isEphemeralContainer: boolean =
				this.sessionMetric?.properties.get(CommonProperties.isEphemeralContainer) ?? false;
			this.sessionMetric = createSessionMetric(
				this.tenantId,
				this.documentId,
				LumberEventName.SessionResult,
				this.serviceConfiguration,
				isEphemeralContainer,
			);
		}

		this.sessionMetric?.setProperties({
			[CommonProperties.serviceSummarySuccess]: this.serviceSummaryGenerated,
		});

		logCommonSessionEndMetrics(
			this.context as DocumentContext,
			closeType,
			this.sessionMetric,
			this.sequenceNumber,
			this.durableSequenceNumber,
			[...this.nackMessages.keys()],
		);
	}

	private ticket(
		rawMessage: IMessage,
		trace: ITrace | undefined,
	): TicketedMessageOutput | undefined {
		// Exit out early for unknown messages
		if (rawMessage.type !== RawOperationType) {
			return undefined;
		}

		// Update and retrieve the minimum sequence number
		const message = rawMessage as IRawOperationMessage;
		const dataContent = this.extractDataContent(message);

		// Check if we should nack this message
		if (this.nackMessages.size > 0 && this.serviceConfiguration.deli.enableNackMessages) {
			for (const nackMessageControlMessageContents of this.nackMessages.values()) {
				let shouldNack = true;

				if (
					nackMessageControlMessageContents.allowSystemMessages &&
					(isServiceMessageType(message.operation.type) || !message.clientId)
				) {
					// this is a system message. don't nack it
					shouldNack = false;
				} else if (nackMessageControlMessageContents.allowedScopes) {
					const clientId = message.clientId;
					if (clientId) {
						const client = this.clientSeqManager.get(clientId);
						if (client) {
							for (const scope of nackMessageControlMessageContents.allowedScopes) {
								if (client.scopes.includes(scope)) {
									// this client has an allowed scope. don't nack it
									shouldNack = false;
									break;
								}
							}
						}
					}
				}

				if (shouldNack) {
					return this.createNackMessage(
						message,
						nackMessageControlMessageContents.content.code,
						nackMessageControlMessageContents.content.type,
						nackMessageControlMessageContents.content.message,
						nackMessageControlMessageContents.content.retryAfter,
					);
				}
			}
		}

		// Check incoming message order. Nack if there is any gap so that the client can resend.
		const messageOrder = this.checkOrder(message);
		if (messageOrder === IncomingMessageOrder.Duplicate) {
			return;
		} else if (messageOrder === IncomingMessageOrder.Gap) {
			return this.createNackMessage(
				message,
				400,
				NackErrorType.BadRequestError,
				`Gap detected in incoming op`,
			);
		}

		if (this.isInvalidMessage(message)) {
			return this.createNackMessage(
				message,
				400,
				NackErrorType.BadRequestError,
				`Op not allowed`,
			);
		}

		// Handle client join/leave messages.
		if (message.clientId) {
			// Nack inexistent client.
			const client = this.clientSeqManager.get(message.clientId);
			if (!client || client.nack) {
				return this.createNackMessage(
					message,
					400,
					NackErrorType.BadRequestError,
					`Nonexistent client`,
				);
			}

			// Verify that the message is within the current window.
			// -1 check just for directly sent ops (e.g., using REST API).
			if (
				message.clientId &&
				message.operation.referenceSequenceNumber !== -1 &&
				message.operation.referenceSequenceNumber < this.minimumSequenceNumber
			) {
				this.clientSeqManager.upsertClient(
					message.clientId,
					message.operation.clientSequenceNumber,
					this.minimumSequenceNumber,
					message.timestamp,
					true,
					[],
					true,
				);
				return this.createNackMessage(
					message,
					400,
					NackErrorType.BadRequestError,
					`Refseq ${message.operation.referenceSequenceNumber} < ${this.minimumSequenceNumber}`,
				);
			}

			// Nack if an unauthorized client tries to summarize.
			if (message.operation.type === MessageType.Summarize && !canSummarize(client.scopes)) {
				return this.createNackMessage(
					message,
					403,
					NackErrorType.InvalidScopeError,
					`Client ${message.clientId} does not have summary permission`,
				);
			}
		} else {
			if (message.operation.type === MessageType.ClientLeave) {
				if (!this.clientSeqManager.removeClient(dataContent)) {
					// not a write client. check if it was a read client
					const readClient = this.sequencedSignalClients.get(dataContent);
					if (readClient) {
						this.sequencedSignalClients.delete(dataContent);
						return this.createSignalMessage(message, this.sequenceNumber, dataContent);
					}

					// Return if the client has already been removed due to a prior leave message.
					return;
				}

				if (
					this.serviceConfiguration.deli.enableLeaveOpNoClientServerMetadata &&
					this.clientSeqManager.count() === 0
				) {
					// add server metadata to indicate the last client left
					message.operation.serverMetadata ??= {};
					(message.operation.serverMetadata as IServerMetadata).noClient = true;
				}
			} else if (message.operation.type === MessageType.ClientJoin) {
				const clientJoinMessage = dataContent as IClientJoin;

				if (clientJoinMessage.detail.mode === "read") {
					if (this.sequencedSignalClients.has(clientJoinMessage.clientId)) {
						// Return if the client has already been added due to a prior join message.
						return;
					}

					// create the signal message
					const signalMessage = this.createSignalMessage(
						message,
						this.sequenceNumber,
						dataContent,
					);

					this.addSequencedSignalClient(clientJoinMessage, signalMessage);

					return signalMessage;
				} else {
					const isNewClient = this.clientSeqManager.upsertClient(
						clientJoinMessage.clientId,
						0,
						this.minimumSequenceNumber,
						message.timestamp,
						true,
						clientJoinMessage.detail.scopes,
						false,
						message.operation.serverMetadata,
					);
					if (!isNewClient) {
						// Return if the client has already been added due to a prior join message.
						return;
					}
				}
			}
		}

		let sequenceNumber = this.sequenceNumber;

		// Get the current sequence number and increment it if appropriate.
		// We don't increment sequence number for noops sent by client since they will
		// be consolidated and sent later as raw message.
		if (message.clientId) {
			// Don't rev for client sent no-ops
			if (message.operation.type !== MessageType.NoOp) {
				// Rev the sequence number
				sequenceNumber = this.revSequenceNumber();
			}

			// Only for directly sent ops (e.g., using REST API). To avoid getting nacked,
			// We rev the refseq number to current sequence number.
			if (message.operation.referenceSequenceNumber === -1) {
				message.operation.referenceSequenceNumber = sequenceNumber;
			}

			this.clientSeqManager.upsertClient(
				message.clientId,
				message.operation.clientSequenceNumber,
				message.operation.referenceSequenceNumber,
				message.timestamp,
				true,
			);
		} else {
			// Don't rev for server sent no-ops, noClient, or Control messages.
			if (
				!(
					message.operation.type === MessageType.NoOp ||
					message.operation.type === MessageType.NoClient ||
					message.operation.type === MessageType.Control
				)
			) {
				sequenceNumber = this.revSequenceNumber();
			}
		}

		// Store the previous minimum sequence number we returned and then update it. If there are no clients
		// then set the MSN to the next SN.
		const msn = this.clientSeqManager.getMinimumSequenceNumber();
		if (msn === -1) {
			this.minimumSequenceNumber = sequenceNumber;
			this.documentCheckpointManager.setNoActiveClients(true);
		} else {
			this.minimumSequenceNumber = msn;
			this.documentCheckpointManager.setNoActiveClients(false);
		}

		let sendType = SendType.Immediate;
		let instruction = InstructionType.NoOp;

		/**
		 * Run extra logic depending on the op type
		 */
		switch (message.operation.type) {
			/**
			 * Sequence number was never rev'd for NoOps. We will decide now based on heuristics.
			 */
			case MessageType.NoOp: {
				// Set up delay sending of client sent no-ops
				if (message.clientId) {
					if (message.operation.contents === null) {
						sendType = SendType.Later;
					} else {
						if (this.minimumSequenceNumber <= this.lastSentMSN) {
							sendType = SendType.Later;
						} else {
							sequenceNumber = this.revSequenceNumber();
						}
					}
				} else {
					if (this.minimumSequenceNumber <= this.lastSentMSN) {
						sendType = SendType.Never;
					} else {
						// Only rev if we need to send a new msn.
						sequenceNumber = this.revSequenceNumber();
					}
				}
				break;
			}

			/**
			 * Sequence number was never rev'd for noClients. We will decide now based on heuristics.
			 */
			case MessageType.NoClient: {
				// Only rev if no clients have shown up since last noClient was sent to alfred.
				if (this.documentCheckpointManager.getNoActiveClients()) {
					sequenceNumber = this.revSequenceNumber();
					message.operation.referenceSequenceNumber = sequenceNumber;
					this.minimumSequenceNumber = sequenceNumber;
				} else {
					sendType = SendType.Never;
				}

				break;
			}

			case MessageType.Control: {
				sendType = SendType.Never;
				const controlMessage = dataContent as IControlMessage;
				switch (controlMessage.type) {
					case ControlMessageType.UpdateDSN: {
						const dsnStatusMsg = `Update DSN: ${JSON.stringify(controlMessage)}`;
						this.context.log?.info(dsnStatusMsg, {
							messageMetaData: {
								documentId: this.documentId,
								tenantId: this.tenantId,
							},
						});
						Lumberjack.info(
							dsnStatusMsg,
							getLumberBaseProperties(this.documentId, this.tenantId),
						);

						const controlContents =
							controlMessage.contents as IUpdateDSNControlMessageContents;
						this.serviceSummaryGenerated = !controlContents.isClientSummary;
						const dsn = controlContents.durableSequenceNumber;
						if (dsn >= this.durableSequenceNumber) {
							// Deli cache is only cleared when no clients have
							// joined since last noClient was sent to alfred
							if (
								controlContents.clearCache &&
								this.documentCheckpointManager.getNoActiveClients()
							) {
								instruction = InstructionType.ClearCache;
								const deliCacheMsg = `Deli cache will be cleared`;
								this.context.log?.info(deliCacheMsg, {
									messageMetaData: {
										documentId: this.documentId,
										tenantId: this.tenantId,
									},
								});
								Lumberjack.info(
									deliCacheMsg,
									getLumberBaseProperties(this.documentId, this.tenantId),
								);
							}

							this.updateDurableSequenceNumber(dsn);
						}

						break;
					}

					case ControlMessageType.NackMessages: {
						const controlContents:
							| INackMessagesControlMessageContents
							| IDisableNackMessagesControlMessageContents = controlMessage.contents;

						this.updateNackMessages(
							controlContents.identifier,
							controlContents.content === undefined ? undefined : controlContents,
						);

						break;
					}

					case ControlMessageType.ExtendClient: {
						const controlContents =
							controlMessage.contents as IExtendClientControlMessageContents;

						const clientsToExtend: Map<string, ISequencedSignalClient> = new Map();

						const clientIds =
							controlContents.clientIds ??
							(controlContents.clientId ? [controlContents.clientId] : []);
						for (const clientId of clientIds) {
							const client = this.sequencedSignalClients.get(clientId);
							if (client) {
								clientsToExtend.set(clientId, client);
							}
						}

						if (clientsToExtend.size > 0) {
							if (this.clientManager) {
								this.clientManager
									.extendSequencedClients(
										this.tenantId,
										this.documentId,
										clientsToExtend,
										this.serviceConfiguration.deli.clientTimeout,
									)
									.catch((error) => {
										const errorMsg = "Could not extend clients";
										this.context.log?.error(
											`${errorMsg}: ${JSON.stringify(error)}`,
											{
												messageMetaData: {
													documentId: this.documentId,
													tenantId: this.tenantId,
												},
											},
										);
										Lumberjack.error(
											errorMsg,
											getLumberBaseProperties(this.documentId, this.tenantId),
											error,
										);
									});
							} else {
								const errorMsg = "Could not extend clients. Missing client manager";
								this.context.log?.error(`${errorMsg}`, {
									messageMetaData: {
										documentId: this.documentId,
										tenantId: this.tenantId,
									},
								});
								Lumberjack.error(
									errorMsg,
									getLumberBaseProperties(this.documentId, this.tenantId),
								);
							}
						}

						break;
					}

					default: {
						// an unknown control message was received
						// emit a control message event to support custom control messages
						this.emit("controlMessage", controlMessage);
						break;
					}
				}

				break;
			}

			/**
			 * Automatically update the DSN when sequencing a summaryAck
			 */
			case MessageType.SummaryAck: {
				if (this.serviceConfiguration.deli.enableAutoDSNUpdate) {
					const dsn = (dataContent as ISummaryAck).summaryProposal.summarySequenceNumber;
					if (dsn >= this.durableSequenceNumber) {
						this.updateDurableSequenceNumber(dsn);
					}
				}

				break;
			}

			default: {
				break;
			}
		}

		// Add traces
		if (trace && message.operation.traces && message.operation.traces.length > 1) {
			message.operation.traces.push(trace, this.createTrace("end"));
		}

		// craft the output message
		const outputMessage = this.createOutputMessage(
			message,
			undefined /* origin */,
			sequenceNumber,
			dataContent,
		);

		return {
			ticketType: TicketType.Sequenced,
			instruction,
			message: outputMessage,
			msn: this.minimumSequenceNumber,
			send: sendType,
			timestamp: message.timestamp,
			type: message.operation.type,
		};
	}

	private extractDataContent(message: IRawOperationMessage): any {
		if (
			message.operation.type === MessageType.ClientJoin ||
			message.operation.type === MessageType.ClientLeave ||
			message.operation.type === MessageType.SummaryAck ||
			message.operation.type === MessageType.SummaryNack ||
			message.operation.type === MessageType.Control
		) {
			const operation = message.operation as IDocumentSystemMessage;
			if (operation.data) {
				return JSON.parse(operation.data);
			}
		}
	}

	private isInvalidMessage(message: IRawOperationMessage): boolean {
		return message.clientId ? isServiceMessageType(message.operation.type) : false;
	}

	private createOutputMessage(
		message: IRawOperationMessage,
		origin: IBranchOrigin | undefined,
		sequenceNumber: number,
		dataContent: any,
	): ISequencedDocumentMessage {
		const outputMessage: ISequencedDocumentMessage = {
			// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
			clientId: message.clientId!,
			clientSequenceNumber: message.operation.clientSequenceNumber,
			contents: message.operation.contents,
			metadata: message.operation.metadata,
			serverMetadata: message.operation.serverMetadata,
			minimumSequenceNumber: this.minimumSequenceNumber,
			origin,
			referenceSequenceNumber: message.operation.referenceSequenceNumber,
			sequenceNumber,
			timestamp: message.timestamp,
			traces: message.operation.traces,
			type: message.operation.type,
			compression: message.operation.compression,
		} as any;
		if (
			message.operation.type === MessageType.Summarize ||
			message.operation.type === MessageType.NoClient
		) {
			const augmentedOutputMessage = outputMessage as ISequencedDocumentAugmentedMessage;

			// Only add additional content if scribe will use this op for generating a summary.
			// `NoClient` ops are ignored by scribe when `generateServiceSummary` is disabled.
			let addAdditionalContent = false;

			if (this.serviceConfiguration.scribe.generateServiceSummary) {
				addAdditionalContent = true;
			} else if (message.operation.type === MessageType.Summarize) {
				// No need to add additionalContent for summarize messages using the single commit flow
				// because scribe will not be involved.
				// eslint-disable-next-line unicorn/no-lonely-if
				if (
					!this.serviceConfiguration.deli.skipSummarizeAugmentationForSingleCommmit ||
					!(JSON.parse(message.operation.contents as string) as ISummaryContent).details
						?.includesProtocolTree
				) {
					addAdditionalContent = true;
				}
			}

			if (addAdditionalContent) {
				const checkpointData = JSON.stringify(this.generateDeliCheckpoint());
				augmentedOutputMessage.additionalContent = checkpointData;
			}
			return augmentedOutputMessage;
		} else if (dataContent === undefined) {
			return outputMessage;
		} else {
			// TODO to consolidate the logic here
			const systemOutputMessage = outputMessage as ISequencedDocumentSystemMessage;
			systemOutputMessage.data = JSON.stringify(dataContent);
			return systemOutputMessage;
		}
	}

	private checkOrder(message: IRawOperationMessage): IncomingMessageOrder {
		if (!message.clientId) {
			return IncomingMessageOrder.ConsecutiveOrSystem;
		}

		const clientId = message.clientId;
		const clientSequenceNumber = message.operation.clientSequenceNumber;

		const client = this.clientSeqManager.get(clientId);
		if (!client) {
			return IncomingMessageOrder.ConsecutiveOrSystem;
		}
		const messageMetaData = {
			documentId: this.documentId,
			tenantId: this.tenantId,
		};
		// Perform duplicate and gap detection - Check that we have a monotonically increasing CID
		const expectedClientSequenceNumber = client.clientSequenceNumber + 1;
		if (clientSequenceNumber === expectedClientSequenceNumber) {
			return IncomingMessageOrder.ConsecutiveOrSystem;
		} else if (clientSequenceNumber > expectedClientSequenceNumber) {
			const gapDetectionMsg = `Gap ${clientId}:${expectedClientSequenceNumber} > ${clientSequenceNumber}`;
			this.context.log?.info(gapDetectionMsg, { messageMetaData });
			Lumberjack.info(
				gapDetectionMsg,
				getLumberBaseProperties(this.documentId, this.tenantId),
			);
			return IncomingMessageOrder.Gap;
		} else {
			const dupDetectionMsg = `Duplicate ${clientId}:${expectedClientSequenceNumber} < ${clientSequenceNumber}`;
			this.context.log?.info(dupDetectionMsg, { messageMetaData });
			Lumberjack.info(
				dupDetectionMsg,
				getLumberBaseProperties(this.documentId, this.tenantId),
			);
			return IncomingMessageOrder.Duplicate;
		}
	}

	/**
	 * Sends a message to the rawdeltas queue.
	 * This essentially sends the message to this deli lambda
	 */
	private async sendToRawDeltas(message: IRawOperationMessage): Promise<void> {
		try {
			await this.rawDeltasProducer.send([message], message.tenantId, message.documentId);
		} catch (error) {
			if (this.closed) {
				return;
			}

			const errorMsg = `Could not send message to rawdeltas`;
			this.context.log?.error(`${errorMsg}: ${JSON.stringify(error)}`, {
				messageMetaData: {
					documentId: this.documentId,
					tenantId: this.tenantId,
				},
			});
			Lumberjack.error(
				errorMsg,
				getLumberBaseProperties(this.documentId, this.tenantId),
				error,
			);
			this.context.error(error, {
				restart: true,
				tenantId: this.tenantId,
				documentId: this.documentId,
			});
		}
	}

	/**
	 * Check if there are any old/idle write clients.
	 * Craft and send a leave message if one is found.
	 * To prevent recurrent leave message sending, leave messages are only piggybacked with other message type.
	 */
	private checkIdleWriteClients(timestamp: number): void {
		const idleClient = this.getIdleClient(timestamp);
		if (idleClient?.clientId) {
			const leaveMessage = this.createLeaveMessage(
				idleClient.clientId,
				idleClient.serverMetadata,
			);
			this.sendToRawDeltas(leaveMessage).catch((error) => {
				const lumberjackProperties = {
					...getLumberBaseProperties(this.documentId, this.tenantId),
					clientId: idleClient.clientId,
				};
				Lumberjack.error(
					"Error sending idle write client leave message to raw deltas",
					lumberjackProperties,
					error,
				);
			});
		}
	}

	/**
	 * Check if there are any expired read clients.
	 * The read client will expire if alfred has not sent
	 * an ExtendClient control message within the time for 'clientTimeout'.
	 * Craft and send a leave message for each one found.
	 */
	private checkIdleReadClients(): void {
		const currentTime = Date.now();

		for (const [clientId, { client, exp }] of this.sequencedSignalClients) {
			// only handle read clients here
			// write client idle is handled by checkIdleWriteClients
			if (client.mode === "read" && exp < currentTime) {
				const leaveMessage = this.createLeaveMessage(clientId);
				this.sendToRawDeltas(leaveMessage).catch((error) => {
					const lumberjackProperties = {
						...getLumberBaseProperties(this.documentId, this.tenantId),
						clientId,
					};
					Lumberjack.error(
						"Error sending idle read client leave message to raw deltas",
						lumberjackProperties,
						error,
					);
				});
			}
		}
	}

	/**
	 * Creates a leave message for inactive clients.
	 */
	private createLeaveMessage(clientId: string, serverMetadata?: any): IRawOperationMessage {
		const leaveMessage: IDocumentSystemMessage = {
			clientSequenceNumber: -1,
			contents: null,
			data: JSON.stringify(clientId),
			referenceSequenceNumber: -1,
			traces: this.serviceConfiguration.enableTraces ? [] : undefined,
			type: MessageType.ClientLeave,
			serverMetadata,
		};
		return this.createRawOperationMessage(leaveMessage);
	}

	/**
	 * Creates a nack message for clients.
	 */
	private createNackMessage(
		message: IRawOperationMessage,
		code: number,
		type: NackErrorType,
		reason: string,
		retryAfter?: number,
	): INackMessageOutput | undefined {
		const clientId = message.clientId;
		if (!clientId) {
			// message was sent by the system and not a client
			// "nacking" the system is not supported
			return undefined;
		}

		const nackMessage: INackMessage = {
			clientId,
			documentId: this.documentId,
			operation: {
				content: {
					code,
					type,
					message: reason,
					retryAfter,
				},
				operation: message.operation,
				sequenceNumber: this.minimumSequenceNumber,
			},
			tenantId: this.tenantId,
			timestamp: Date.now(),
			type: NackOperationType,
		};

		return {
			ticketType: TicketType.Nack,
			message: nackMessage,
		};
	}

	/**
	 * Creates a signal message for clients.
	 */
	private createSignalMessage(
		message: IRawOperationMessage,
		sequenceNumber: number,
		dataContent: any,
	): ISignalMessageOutput {
		let signalMessage: ISignalMessage;

		switch (message.operation.type) {
			case MessageType.ClientJoin: {
				signalMessage = createRoomJoinMessage(
					(dataContent as IClientJoin).clientId,
					(dataContent as IClientJoin).detail,
				);
				break;
			}

			case MessageType.ClientLeave: {
				signalMessage = createRoomLeaveMessage(
					typeof dataContent === "string" ? dataContent : dataContent.clientId,
				);
				break;
			}

			case MessageType.Control: {
				// this will tell broadcaster to process the control message the client
				signalMessage = {
					clientId: null,
					content: JSON.stringify({
						type: MessageType.Control,
						content: dataContent,
					}),
				};
				break;
			}

			default: {
				throw new Error(`Cannot create signal message for type ${message.operation.type}`);
			}
		}

		(signalMessage as any).referenceSequenceNumber = sequenceNumber;
		(signalMessage as any).clientConnectionNumber = ++this.signalClientConnectionNumber;

		return {
			ticketType: TicketType.Signal,
			message: {
				type: SignalOperationType,
				tenantId: this.tenantId,
				documentId: this.documentId,
				operation: signalMessage,
				timestamp: Date.now(),
			},
		};
	}

	private createOpMessage(type: string): IRawOperationMessage {
		return this.createRawOperationMessage({
			clientSequenceNumber: -1,
			contents: null,
			referenceSequenceNumber: -1,
			traces: this.serviceConfiguration.enableTraces ? [] : undefined,
			type,
		});
	}

	private createRawOperationMessage(operation: IDocumentMessage): IRawOperationMessage {
		return {
			clientId: null,
			documentId: this.documentId,
			operation,
			tenantId: this.tenantId,
			timestamp: Date.now(),
			type: RawOperationType,
		};
	}

	/**
	 * Creates a new trace
	 */
	private createTrace(action: string): ITrace {
		const trace: ITrace = {
			action,
			service: "deli",
			timestamp: Date.now(),
		};
		return trace;
	}

	/**
	 * Generates a checkpoint for the current state
	 */
	private generateCheckpoint(reason: CheckpointReason): ICheckpointParams {
		const checkpointInfo = this.documentCheckpointManager.getCheckpointInfo();
		return {
			reason,
			deliState: this.generateDeliCheckpoint(),
			deliCheckpointMessage: checkpointInfo.currentCheckpointMessage as IQueuedMessage,
			kafkaCheckpointMessage: checkpointInfo.currentKafkaCheckpointMessage,
		};
	}

	private generateDeliCheckpoint(): IDeliState {
		return {
			clients: this.clientSeqManager.cloneValues(),
			durableSequenceNumber: this.durableSequenceNumber,
			expHash1: this.lastHash,
			logOffset: this.logOffset,
			sequenceNumber: this.sequenceNumber,
			signalClientConnectionNumber: this.signalClientConnectionNumber,
			lastSentMSN: this.lastSentMSN,
			nackMessages: [...this.nackMessages],
			checkpointTimestamp: Date.now(),
		};
	}

	/**
	 * Returns a new sequence number
	 */
	private revSequenceNumber(): number {
		return ++this.sequenceNumber;
	}

	/**
	 * Get idle client.
	 */
	private getIdleClient(timestamp: number): IClientSequenceNumber | undefined {
		const client = this.clientSeqManager.peek();
		if (
			client?.canEvict &&
			timestamp - client.lastUpdate > this.serviceConfiguration.deli.clientTimeout
		) {
			return client;
		}
	}

	private setActivityIdleTimer(): void {
		if (this.documentCheckpointManager.getNoActiveClients()) {
			return;
		}
		this.activityIdleTimer = setTimeout(() => {
			if (!this.documentCheckpointManager.getNoActiveClients()) {
				const noOpMessage = this.createOpMessage(MessageType.NoOp);
				this.sendToRawDeltas(noOpMessage).catch((error) => {
					const lumberjackProperties = {
						...getLumberBaseProperties(this.documentId, this.tenantId),
					};
					Lumberjack.error(
						"Error refreshing activity idle timer with noOp message",
						lumberjackProperties,
						error,
					);
				});
			}
		}, this.serviceConfiguration.deli.activityTimeout);
	}

	private clearActivityIdleTimer(): void {
		if (this.activityIdleTimer !== undefined) {
			clearTimeout(this.activityIdleTimer);
			this.activityIdleTimer = undefined;
		}
	}

	private setReadClientIdleTimer(): void {
		this.clearReadClientIdleTimer();

		this.readClientIdleTimer = setInterval(() => {
			this.checkIdleReadClients();
		}, this.serviceConfiguration.deli.readClientIdleTimer);
	}

	private clearReadClientIdleTimer(): void {
		if (this.readClientIdleTimer !== undefined) {
			clearInterval(this.readClientIdleTimer);
			this.readClientIdleTimer = undefined;
		}
	}

	private setNoopConsolidationTimer(): void {
		if (this.documentCheckpointManager.getNoActiveClients()) {
			return;
		}
		this.noopEvent = setTimeout(() => {
			if (!this.documentCheckpointManager.getNoActiveClients()) {
				const noOpMessage = this.createOpMessage(MessageType.NoOp);
				this.sendToRawDeltas(noOpMessage).catch((error) => {
					const lumberjackProperties = {
						...getLumberBaseProperties(this.documentId, this.tenantId),
					};
					Lumberjack.error(
						"Error sending noOp event to raw deltas",
						lumberjackProperties,
						error,
					);
				});
			}
		}, this.serviceConfiguration.deli.noOpConsolidationTimeout);
	}

	private clearNoopConsolidationTimer(): void {
		if (this.noopEvent !== undefined) {
			clearTimeout(this.noopEvent);
			this.noopEvent = undefined;
		}
	}

	/**
	 * Reset the op event idle timer
	 * Called after a message is sequenced
	 */
	private updateOpIdleTimer(): void {
		const idleTime = this.serviceConfiguration.deli.opEvent.idleTime;
		if (idleTime === undefined) {
			return;
		}

		this.clearOpIdleTimer();

		this.opEvent.idleTimer = setTimeout(() => {
			this.emitOpEvent(OpEventType.Idle);
		}, idleTime);
	}

	private clearOpIdleTimer(): void {
		if (this.opEvent.idleTimer !== undefined) {
			clearTimeout(this.opEvent.idleTimer);
			this.opEvent.idleTimer = undefined;
		}
	}

	/**
	 * Resets the op event MaxTime timer
	 * Called after an opEvent is emitted
	 */
	private updateOpMaxTimeTimer(): void {
		const maxTime = this.serviceConfiguration.deli.opEvent.maxTime;
		if (maxTime === undefined) {
			return;
		}

		this.clearOpMaxTimeTimer();

		this.opEvent.maxTimer = setTimeout(() => {
			this.emitOpEvent(OpEventType.MaxTime);
		}, maxTime);
	}

	private clearOpMaxTimeTimer(): void {
		if (this.opEvent.maxTimer !== undefined) {
			clearTimeout(this.opEvent.maxTimer);
			this.opEvent.maxTimer = undefined;
		}
	}

	/**
	 * Emits an opEvent for the provided type
	 * Also resets the MaxTime timer
	 */
	private emitOpEvent(type: OpEventType, force?: boolean): void {
		if (!force && this.opEvent.sequencedMessagesSinceLastOpEvent === 0) {
			// no need to emit since no messages were handled since last time
			return;
		}

		this.emit(
			"opEvent",
			type,
			this.sequenceNumber,
			this.opEvent.sequencedMessagesSinceLastOpEvent,
		);

		this.opEvent.sequencedMessagesSinceLastOpEvent = 0;

		this.updateOpMaxTimeTimer();
	}

	/**
	 * Checks if the nackMessages flag should be reset
	 */
	private checkNackMessagesState(): void {
		if (
			this.serviceConfiguration.deli.summaryNackMessages.enable &&
			this.nackMessages.has(NackMessagesType.SummaryMaxOps)
		) {
			// Deli is nacking messages due to summary max ops
			// Check if this new dsn gets it out of that state
			const opsSinceLastSummary = this.sequenceNumber - this.durableSequenceNumber;
			if (opsSinceLastSummary <= this.serviceConfiguration.deli.summaryNackMessages.maxOps) {
				// stop nacking future messages
				this.updateNackMessages(NackMessagesType.SummaryMaxOps, undefined);
			}
		}
	}

	/**
	 * Determines a checkpoint reason based on some heuristics
	 * @returns a reason when it's time to checkpoint, or undefined if no checkpoint should be made
	 */
	private getCheckpointReason(messageType: string | undefined): CheckpointReason | undefined {
		const checkpointHeuristics = this.serviceConfiguration.deli.checkpointHeuristics;
		if (!checkpointHeuristics.enable) {
			// always checkpoint since heuristics are disabled
			return CheckpointReason.EveryMessage;
		}

		const checkpointInfo = this.documentCheckpointManager.getCheckpointInfo();
		if (checkpointInfo.rawMessagesSinceCheckpoint >= checkpointHeuristics.maxMessages) {
			// exceeded max messages since last checkpoint
			return CheckpointReason.MaxMessages;
		}

		if (Date.now() - checkpointInfo.lastCheckpointTime >= checkpointHeuristics.maxTime) {
			// exceeded max time since last checkpoint
			return CheckpointReason.MaxTime;
		}

		if (this.lastInstruction === InstructionType.ClearCache) {
			// last instruction is for clearing the cache
			// checkpoint now to ensure that happens
			return CheckpointReason.ClearCache;
		}

		if (
			this.documentCheckpointManager.getNoActiveClients() &&
			messageType === MessageType.NoClient
		) {
			return CheckpointReason.NoClients;
		}

		return undefined;
	}

	/**
	 * Checkpoints the current state once the pending kafka messages are produced
	 */
	private checkpoint(reason: CheckpointReason, globalCheckpointOnly: boolean): void {
		this.documentCheckpointManager.resetCheckpointTimer();

		Promise.all([this.lastSendP, this.lastNoClientP])
			.then(() => {
				const checkpointParams = this.generateCheckpoint(reason);
				if (reason === CheckpointReason.ClearCache) {
					checkpointParams.clear = true;
				}
				const lumberjackProperties: Record<string, any> = {
					...getLumberBaseProperties(this.documentId, this.tenantId),
					lastOffset: this.logOffset,
					deliCheckpointOffset: checkpointParams.deliCheckpointMessage.offset,
					deliCheckpointPartition: checkpointParams.deliCheckpointMessage.partition,
					kafkaCheckpointOffset: checkpointParams.kafkaCheckpointMessage?.offset,
					kafkaCheckpointPartition: checkpointParams.kafkaCheckpointMessage?.partition,
					localCheckpointEnabled: this.localCheckpointEnabled,
					globalCheckpointOnly: this.globalCheckpointOnly,
					localCheckpoint: this.localCheckpointEnabled && !this.globalCheckpointOnly,
					sessionEndCheckpoint: checkpointParams.reason === CheckpointReason.NoClients,
					recievedNoClientOp: this.recievedNoClientOp,
				};
				const checkpointReason = CheckpointReason[checkpointParams.reason];
				lumberjackProperties.checkpointReason = checkpointReason;
				const checkpointMessage = `Writing checkpoint. Reason: ${checkpointReason}`;
				Lumberjack.info(checkpointMessage, lumberjackProperties);
				this.checkpointContext
					.checkpoint(
						checkpointParams,
						this.serviceConfiguration.deli.restartOnCheckpointFailure,
						globalCheckpointOnly,
					)
					.catch((error) => {
						Lumberjack.error("Error writing checkpoint", lumberjackProperties, error);
					});
			})
			.catch((error) => {
				const errorMsg = `Could not send message to scriptorium`;
				this.context.log?.error(`${errorMsg}: ${JSON.stringify(error)}`, {
					messageMetaData: {
						documentId: this.documentId,
						tenantId: this.tenantId,
					},
				});
				Lumberjack.error(
					errorMsg,
					getLumberBaseProperties(this.documentId, this.tenantId),
					error,
				);
				this.context.error(error, {
					restart: true,
					tenantId: this.tenantId,
					documentId: this.documentId,
				});
			});
	}

	private readonly idleTimeCheckpoint = (message: IQueuedMessage): void => {
		this.checkpoint(CheckpointReason.IdleTime, this.globalCheckpointOnly);
	};

	/**
	 * Updates the durable sequence number
	 * @param dsn - New durable sequence number
	 */
	private updateDurableSequenceNumber(dsn: number): void {
		this.durableSequenceNumber = dsn;

		this.checkNackMessagesState();

		this.emit("updatedDurableSequenceNumber", dsn);

		if (this.serviceConfiguration.deli.opEvent.enable) {
			// ops were reliably stored
			// ensure op event timers & last sequenced op counters are reset
			// that will make the MaxTime & MaxOps op events accurate
			this.emitOpEvent(OpEventType.UpdatedDurableSequenceNumber, true);
		}
	}

	/**
	 * Adds/updates/removes a nack message
	 * @param type - Nack message type
	 * @param contents - Nack messages contents or undefined to delete the nack message
	 */
	private updateNackMessages(
		type: NackMessagesType,
		contents: INackMessagesControlMessageContents | undefined,
	): void {
		if (contents === undefined) {
			this.nackMessages.delete(type);
		} else {
			this.nackMessages.set(type, contents);
		}

		this.emit("updatedNackMessages", type, contents);
	}

	/**
	 * Adds a sequenced signal client to the in-memory map.
	 * Alfred will periodically send ExtendClient control messages, which will extend the client expiration times.
	 * @param clientJoinMessage - Client join message (from dataContent)
	 * @param signalMessage - Ticketed join signal message
	 */
	private addSequencedSignalClient(
		clientJoinMessage: IClientJoin,
		signalMessage: ISignalMessageOutput,
	): void {
		const sequencedSignalClient: ISequencedSignalClient = {
			client: clientJoinMessage.detail,
			referenceSequenceNumber: (signalMessage.message.operation as any)
				.referenceSequenceNumber,
			clientConnectionNumber: (signalMessage.message.operation as any).clientConnectionNumber,
			exp: Date.now() + this.serviceConfiguration.deli.clientTimeout,
		};

		this.sequencedSignalClients.set(clientJoinMessage.clientId, sequencedSignalClient);
	}
}
