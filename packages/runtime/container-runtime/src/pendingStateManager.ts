/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ICriticalContainerError } from "@fluidframework/container-definitions";
import { IDisposable } from "@fluidframework/core-interfaces";
import { assert, Lazy } from "@fluidframework/core-utils/internal";
import { ISequencedDocumentMessage } from "@fluidframework/driver-definitions";
import {
	ITelemetryLoggerExt,
	DataProcessingError,
	LoggingError,
} from "@fluidframework/telemetry-utils/internal";
import Deque from "double-ended-queue";

import { InboundSequencedContainerRuntimeMessage } from "./messageTypes.js";
import { asBatchMetadata, IBatchMetadata, isBatchMetadata } from "./metadata.js";
import { pkgVersion } from "./packageVersion.js";

/**
 * This represents a message that has been submitted and is added to the pending queue when `submit` is called on the
 * ContainerRuntime. This message has either not been ack'd by the server or has not been submitted to the server yet.
 */
export interface IPendingMessage {
	type: "message";
	referenceSequenceNumber: number;
	content: string;
	localOpMetadata: unknown;
	opMetadata: Record<string, unknown> | undefined;
	sequenceNumber?: number;
	//* Info needed to render the batchId on reconnect
	//* undefined means it was added to PSM before ever being submitted (disconnect raced flush and won)
	batchIdContext?: {
		//* Don't actually need the clientID until this message is part of serialization.
		//* NOTE if we do that: Suppose a message stays in PSM over several reconnects, and is serialized during
		//* each interim connection. Any of those serializations _could_ be hydrated from,
		//* and this should have the same ID in them all.  So don't overwrite it upon later serializations.
		originalClientId: string;
		clientSequenceNumber: number;
	};
}

export interface IPendingLocalState {
	/**
	 * list of pending states, including ops and batch information
	 */
	pendingStates: IPendingMessage[];
}

//* A pending message that is being resubmitted
export interface IPendingBatchMessage {
	content: string;
	localOpMetadata: unknown;
	opMetadata: Record<string, unknown> | undefined;
}

export interface IRuntimeStateHandler {
	connected(): boolean;
	clientId(): string | undefined;
	close(error?: ICriticalContainerError): void;
	applyStashedOp(content: string): Promise<unknown>;
	reSubmit(message: IPendingBatchMessage): void;
	reSubmitBatch(batch: IPendingBatchMessage[], batchId: string): void;
	isActiveConnection: () => boolean;
	isAttached: () => boolean;
}

/** Union of keys of T */
type KeysOfUnion<T extends object> = T extends T ? keyof T : never;
/** *Partial* type all possible combinations of properties and values of union T.
 * This loosens typing allowing access to all possible properties without
 * narrowing.
 */
type AnyComboFromUnion<T extends object> = { [P in KeysOfUnion<T>]?: T[P] };

function buildPendingMessageContent(
	// AnyComboFromUnion is needed need to gain access to compatDetails that
	// is only defined for some cases.
	message: AnyComboFromUnion<InboundSequencedContainerRuntimeMessage>,
): string {
	// IMPORTANT: Order matters here, this must match the order of the properties used
	// when submitting the message.
	const { type, contents, compatDetails } = message;
	// Any properties that are not defined, won't be emitted by stringify.
	return JSON.stringify({ type, contents, compatDetails });
}

/**
 * PendingStateManager is responsible for maintaining the messages that have not been sent or have not yet been
 * acknowledged by the server. It also maintains the batch information for both automatically and manually flushed
 * batches along with the messages.
 * When the Container reconnects, it replays the pending states, which includes manual flushing
 * of messages and triggering resubmission of unacked ops.
 *
 * It verifies that all the ops are acked, are received in the right order and batch information is correct.
 */
export class PendingStateManager implements IDisposable {
	private readonly pendingMessages = new Deque<IPendingMessage>();
	// This queue represents already acked messages.
	private readonly initialMessages = new Deque<IPendingMessage>();

	/**
	 * Sequenced local ops that are saved when stashing since pending ops may depend on them
	 */
	private savedOps: IPendingMessage[] = [];

	private readonly disposeOnce = new Lazy<void>(() => {
		this.initialMessages.clear();
		this.pendingMessages.clear();
	});

	// Indicates whether we are processing a batch. -- what's the batchId?
	private processingBatchId: string | undefined = undefined;

	//* Batch IDs are not stamped until reconnect, so if it's missing we need to be ready to compute it
	private incomingComputedBatchId: string | undefined;

	// This stores the first message in the batch that we are processing. This is used to verify that we get
	// the correct batch metadata.
	private pendingBatchBeginMessage: ISequencedDocumentMessage | undefined;

	//* Used to ensure we don't replay ops on the same connection twice
	private clientIdFromLastReplay: string | undefined;

	/**
	 * The pending messages count. Includes `pendingMessages` and `initialMessages` to keep in sync with
	 * 'hasPendingMessages'.
	 */
	public get pendingMessagesCount(): number {
		return this.pendingMessages.length + this.initialMessages.length;
	}

	/**
	 * The minimumPendingMessageSequenceNumber is the minimum of the first pending message and the first initial message.
	 *
	 * We need this so that we can properly keep local data and maintain the correct sequence window.
	 */
	public get minimumPendingMessageSequenceNumber(): number | undefined {
		return this.pendingMessages.peekFront()?.referenceSequenceNumber;
	}

	/**
	 * Called to check if there are any pending messages in the pending message queue.
	 * @returns A boolean indicating whether there are messages or not.
	 */
	public hasPendingMessages(): boolean {
		return this.pendingMessagesCount !== 0;
	}

	//* Called when serializing the container
	public getLocalState(snapshotSequenceNumber?: number): IPendingLocalState {
		assert(
			this.initialMessages.isEmpty(),
			0x2e9 /* "Must call getLocalState() after applying initial states" */,
		);
		const newSavedOps = [...this.savedOps].filter((message) => {
			assert(
				message.sequenceNumber !== undefined,
				0x97c /* saved op should already have a sequence number */,
			);
			return message.sequenceNumber >= (snapshotSequenceNumber ?? 0);
		});
		this.pendingMessages.toArray().forEach((message) => {
			if (
				snapshotSequenceNumber !== undefined &&
				message.referenceSequenceNumber < snapshotSequenceNumber
			) {
				throw new LoggingError("trying to stash ops older than our latest snapshot");
			}
		});
		return {
			pendingStates: [...newSavedOps, ...this.pendingMessages.toArray()].map((message) => {
				return { ...message, localOpMetadata: undefined };
			}),
		};
	}

	constructor(
		private readonly stateHandler: IRuntimeStateHandler,
		initialLocalState: IPendingLocalState | undefined,
		private readonly logger: ITelemetryLoggerExt | undefined,
	) {
		if (initialLocalState?.pendingStates) {
			this.initialMessages.push(...initialLocalState.pendingStates);
		}
	}

	public get disposed() {
		return this.disposeOnce.evaluated;
	}
	public readonly dispose = () => this.disposeOnce.value;

	/**
	 * Called when a message is submitted locally. Adds the message and the associated details to the pending state
	 * queue.
	 * @param content - The container message type.
	 * //* TODO: update caller to increment csn? I wish PSM just took the batch (ok for now since batchIdContext is only used on first message of batch)
	 * @param clientSequenceNumber - The clientSequenceNumber assigned to the first message in the batch
	 * @param referenceSequenceNumber - The referenceSequenceNumber of the batch.
	 * @param localOpMetadata - The local metadata associated with the message.
	 * @param opMetadata - The op metadata to be included on payload over the wire.
	 */
	public onSubmitMessage(
		content: string,
		clientSequenceNumber: number | undefined,
		referenceSequenceNumber: number,
		localOpMetadata: unknown,
		opMetadata: Record<string, unknown> | undefined,
	) {
		//* Ops shouldn't be sent when disconnected, apart when disconnecting races flush
		//* TODO: Deal with ops sent before first connection, if that's possible...?
		const clientId = this.stateHandler.clientId();
		assert(clientId !== undefined, "Shouldn't see ops before the first connection");

		const pendingMessage: IPendingMessage = {
			type: "message",
			referenceSequenceNumber,
			content,
			localOpMetadata,
			opMetadata,
			batchIdContext:
				clientSequenceNumber === undefined // Message not submitted, so batchId is meaningless/irrelevant
					? undefined
					: {
							originalClientId: clientId,
							clientSequenceNumber,
					  },
		};

		this.pendingMessages.push(pendingMessage);
	}

	/**
	 * Applies stashed ops at their reference sequence number so they are ready to be ACKed or resubmitted
	 * @param seqNum - Sequence number at which to apply ops. Will apply all ops if seqNum is undefined.
	 */
	public async applyStashedOpsAt(seqNum?: number) {
		// apply stashed ops at sequence number
		while (!this.initialMessages.isEmpty()) {
			if (seqNum !== undefined) {
				// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
				const peekMessage = this.initialMessages.peekFront()!;
				if (peekMessage.referenceSequenceNumber > seqNum) {
					break; // nothing left to do at this sequence number
				}
				if (peekMessage.referenceSequenceNumber < seqNum) {
					throw new Error("loaded from snapshot too recent to apply stashed ops");
				}
			}
			// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
			const nextMessage = this.initialMessages.shift()!;
			try {
				// applyStashedOp will cause the DDS to behave as if it has sent the op but not actually send it
				const localOpMetadata = await this.stateHandler.applyStashedOp(nextMessage.content);
				if (!this.stateHandler.isAttached()) {
					if (localOpMetadata !== undefined) {
						throw new Error("Local Op Metadata must be undefined when not attached");
					}
				} else {
					nextMessage.localOpMetadata = localOpMetadata;
					// then we push onto pendingMessages which will cause PendingStateManager to resubmit when we connect
					this.pendingMessages.push(nextMessage);
				}
			} catch (error) {
				throw DataProcessingError.wrapIfUnrecognized(error, "applyStashedOp", nextMessage);
			}
		}
	}

	/**
	 * See if we're waiting for a batch start, and are about to processes a batch start with matching batch ID
	 * @returns true if the batch IDs match
	 */
	public checkForMatchingBatchId(message: InboundSequencedContainerRuntimeMessage): boolean {
		const pendingMessage = this.pendingMessages.peekFront();
		if (
			isBatchMetadata(pendingMessage?.opMetadata) &&
			pendingMessage.opMetadata.batchId !== undefined &&
			isBatchMetadata(message.metadata) &&
			message.metadata.batchId !== undefined
		) {
			const pendingEffectiveBatchId =
				pendingMessage.opMetadata.batchId !== "-"
					? pendingMessage.opMetadata.batchId
					: //* NOTE: batchIdContext will be defined if the message was submitted
					  JSON.stringify([
							pendingMessage.batchIdContext?.originalClientId,
							pendingMessage.batchIdContext?.clientSequenceNumber,
					  ]);
			const incomingEffectiveBatchId =
				message.metadata.batchId !== "-"
					? message.metadata.batchId
					: //* TODO: Is this the correct way to fallback here?
					  JSON.stringify([message.clientId, message.clientSequenceNumber]);

			return pendingEffectiveBatchId === incomingEffectiveBatchId;
		}
		return false;
	}

	/**
	 * Processes a local message once its ack'd by the server. It verifies that there was no data corruption and that
	 * the batch information was preserved for batch messages.
	 * @param message - The message that got ack'd and needs to be processed.
	 */
	public processPendingLocalMessage(message: InboundSequencedContainerRuntimeMessage): unknown {
		// Pre-processing part - This may be the start of a batch.
		this.maybeProcessBatchBegin(message);
		// Get the next message from the pending queue. Verify a message exists.
		const pendingMessage = this.pendingMessages.peekFront();
		assert(
			pendingMessage !== undefined,
			0x169 /* "No pending message found for this remote message" */,
		);
		assert(
			pendingMessage.referenceSequenceNumber === message.referenceSequenceNumber,
			"Local message should have matching refSeq",
		);

		pendingMessage.sequenceNumber = message.sequenceNumber;
		this.savedOps.push(pendingMessage);

		this.pendingMessages.shift();

		const pendingBatchMetadata = asBatchMetadata(pendingMessage.opMetadata);
		const pendingBatchId = pendingBatchMetadata?.batchId;

		const incomingEffectiveBatchId =
			this.processingBatchId !== "-" ? this.processingBatchId : this.incomingComputedBatchId;
		const pendingEffectiveBatchId =
			pendingBatchId !== "-"
				? pendingBatchId
				: //* NOTE: batchIdContext will be defined if the message was submitted
				  JSON.stringify([
						pendingMessage.batchIdContext?.originalClientId,
						pendingMessage.batchIdContext?.clientSequenceNumber,
				  ]);

		const messageContent = buildPendingMessageContent(message);

		//* TODO: Can we switch back to comparing CSN...?
		// Stringified content should match
		if (
			(pendingBatchId !== undefined &&
				pendingEffectiveBatchId !== incomingEffectiveBatchId) || //* If we are awaiting the start of a batch, the batchId should match
			pendingMessage.content !== messageContent
		) {
			this.stateHandler.close(
				DataProcessingError.create(
					"pending local message content mismatch",
					"unexpectedAckReceived",
					message,
					{
						expectedMessageType: JSON.parse(pendingMessage.content).type,
					},
				),
			);
			return;
		}

		// Post-processing part - If we are processing a batch then this could be the last message in the batch.
		this.maybeProcessBatchEnd(message);

		return pendingMessage.localOpMetadata;
	}

	/**
	 * This message could be the first message in batch. If so, set batch state marking the beginning of a batch.
	 * @param message - The message that is being processed.
	 */
	private maybeProcessBatchBegin(message: ISequencedDocumentMessage) {
		const metadata = message.metadata;
		// This message is the first in a batch if the "batch" property on the metadata is set to true
		// or if it has batchId (in case of single-message batch)
		if (
			isBatchMetadata(metadata) &&
			(metadata.batch === true || metadata.batchId !== undefined)
		) {
			// We should not already be processing a batch and there should be no pending batch begin message.
			assert(
				this.processingBatchId === undefined && this.pendingBatchBeginMessage === undefined,
				0x16b /* "The pending batch state indicates we are already processing a batch" */,
			);
			const batchId = metadata.batchId ?? "BACK-COMPAT-BATCH-ID"; //* Trying to get tests to pass
			(message.metadata as any).batchId = batchId; //* back compat hack for prototype

			// Set the pending batch state indicating we have started processing a batch.
			this.pendingBatchBeginMessage = message;
			this.processingBatchId = batchId;

			//* TODO: Is this the correct way to compute this?
			this.incomingComputedBatchId = JSON.stringify([
				message.clientId,
				message.clientSequenceNumber,
			]);
		}
	}

	/**
	 * This message could be the last message in batch. If so, clear batch state since the batch is complete.
	 * @param message - The message that is being processed.
	 */
	private maybeProcessBatchEnd(message: ISequencedDocumentMessage) {
		if (this.processingBatchId === undefined) {
			return;
		}

		// There should be a pending batch begin message.
		assert(
			this.pendingBatchBeginMessage !== undefined,
			0x16d /* "There is no pending batch begin message" */,
		);

		// Get the batch begin metadata from the first message in the batch.
		const batchBeginMetadata = asBatchMetadata(this.pendingBatchBeginMessage.metadata);

		// Check if this message is the end of a batch (does not apply to size === 1)
		const batchEndMetadataFlag = (message.metadata as IBatchMetadata | undefined)?.batch;

		if (
			this.pendingMessages.isEmpty() || //* No more pending messages...? How?
			batchEndMetadataFlag === false || // end of a batch (size > 1)
			(batchBeginMetadata?.batchId !== undefined && batchBeginMetadata.batch === undefined) // Single message batch
		) {
			// There could be just a single message in the batch. If so, it should not have any batch metadata. If there
			// are multiple messages in the batch, verify that we got the correct batch begin and end metadata.
			if (this.pendingBatchBeginMessage === message) {
				assert(
					batchBeginMetadata?.batchId !== undefined &&
						batchBeginMetadata.batch === undefined,
					0x16e /* "Batch with single message should have batchId but no flag" */,
				);
			} else {
				if (batchBeginMetadata?.batch !== true || batchEndMetadataFlag !== false) {
					this.stateHandler.close(
						DataProcessingError.create(
							"Pending batch inconsistency", // Formerly known as asserts 0x16f and 0x170
							"processPendingLocalMessage",
							message,
							{
								runtimeVersion: pkgVersion,
								batchClientId:
									// eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
									this.pendingBatchBeginMessage.clientId === null
										? "null"
										: this.pendingBatchBeginMessage.clientId,
								clientId: this.stateHandler.clientId(),
								hasBatchId: batchBeginMetadata?.batchId !== undefined,
								hasBatchStart: batchBeginMetadata?.batch === true,
								hasBatchEnd: batchEndMetadataFlag === false,
								messageType: message.type,
								pendingMessagesCount: this.pendingMessagesCount,
							},
						),
					);
				}
			}

			// Clear the pending batch state now that we have processed the entire batch.
			this.pendingBatchBeginMessage = undefined;
			this.processingBatchId = undefined;
			this.incomingComputedBatchId = undefined;
		}
	}

	/**
	 * Called when the Container's connection state changes. If the Container gets connected, it replays all the pending
	 * states in its queue. This includes triggering resubmission of unacked ops.
	 * ! Note: successfully resubmitting an op that has been successfully sequenced is not possible due to checks in the ConnectionStateHandler (Loader layer)
	 */
	public replayPendingStates() {
		assert(
			this.stateHandler.connected(),
			0x172 /* "The connection state is not consistent with the runtime" */,
		);

		// This assert suggests we are about to send same ops twice, which will result in data loss.
		assert(
			this.clientIdFromLastReplay !== this.stateHandler.clientId(),
			0x173 /* "replayPendingStates called twice for same clientId!" */,
		);
		this.clientIdFromLastReplay = this.stateHandler.clientId();

		assert(
			this.initialMessages.isEmpty(),
			0x174 /* "initial states should be empty before replaying pending" */,
		);

		const initialPendingMessagesCount = this.pendingMessages.length;
		let remainingPendingMessagesCount = this.pendingMessages.length;

		// Process exactly `pendingMessagesCount` items in the queue as it represents the number of messages that were
		// pending when we connected. This is important because the `reSubmitFn` might add more items in the queue
		// which must not be replayed.
		while (remainingPendingMessagesCount > 0) {
			// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
			let pendingMessage = this.pendingMessages.shift()!;
			remainingPendingMessagesCount--;
			assert(
				pendingMessage.opMetadata?.batch !== false,
				0x41b /* We cannot process batches in chunks */,
			);

			//* TODO: Figure out format
			//* If this batch doesn't have a batchId yet, this is it.
			const computedBatchId =
				pendingMessage.batchIdContext === undefined
					? "-" //* Placeholder batchId for initial connection. If batchIdContext is undef, message was never submitted
					: JSON.stringify([
							pendingMessage.batchIdContext.originalClientId,
							pendingMessage.batchIdContext.clientSequenceNumber,
					  ]);
			const existingBatchId = asBatchMetadata(pendingMessage.opMetadata)?.batchId ?? "-";
			//* Note: Doesn't apply to non-batched messages (what's an example of this...??)
			const batchId = existingBatchId !== "-" ? existingBatchId : computedBatchId;

			/**
			 * We want to ensure grouped messages get processed in a batch.
			 * Note: It is not possible for the PendingStateManager to receive a partially acked batch. It will
			 * either receive the whole batch ack or nothing at all, thanks to the ScheduleManager.
			 */
			if (pendingMessage.opMetadata?.batch) {
				assert(
					remainingPendingMessagesCount > 0,
					0x554 /* Last pending message cannot be a batch begin */,
				);
				assert(existingBatchId !== undefined, "Expected batchId on start of batch");

				const batch: IPendingBatchMessage[] = [];

				// check is >= because batch end may be last pending message
				while (remainingPendingMessagesCount >= 0) {
					batch.push({
						content: pendingMessage.content,
						localOpMetadata: pendingMessage.localOpMetadata,
						opMetadata: pendingMessage.opMetadata,
					});

					if (pendingMessage.opMetadata?.batch === false) {
						break;
					}
					assert(remainingPendingMessagesCount > 0, 0x555 /* No batch end found */);

					// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
					pendingMessage = this.pendingMessages.shift()!;
					remainingPendingMessagesCount--;
					assert(
						pendingMessage.opMetadata?.batch !== true,
						0x556 /* Batch start needs a corresponding batch end */,
					);
				}

				this.stateHandler.reSubmitBatch(batch, batchId);
			} else if (existingBatchId !== undefined) {
				// This is a single message batch
				const batch: IPendingBatchMessage[] = [];
				batch.push({
					content: pendingMessage.content,
					localOpMetadata: pendingMessage.localOpMetadata,
					opMetadata: pendingMessage.opMetadata,
				});
				this.stateHandler.reSubmitBatch(batch, batchId);
			} else {
				//* TODO: When is this case hit??  It will be vulnerable to op duplication if the container forks
				this.stateHandler.reSubmit({
					content: pendingMessage.content,
					localOpMetadata: pendingMessage.localOpMetadata,
					opMetadata: pendingMessage.opMetadata,
				});
			}
		}

		// pending ops should no longer depend on previous sequenced local ops after resubmit
		this.savedOps = [];

		// We replayPendingStates on read connections too - we expect these to get nack'd though, and to then reconnect
		// on a write connection and replay again. This filters out the replay that happens on the read connection so
		// we only see the replays on write connections (that have a chance to go through).
		if (this.stateHandler.isActiveConnection()) {
			this.logger?.sendTelemetryEvent({
				eventName: "PendingStatesReplayed",
				count: initialPendingMessagesCount,
				clientId: this.stateHandler.clientId(),
			});
		}
	}
}
