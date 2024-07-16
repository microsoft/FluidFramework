/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ICriticalContainerError } from "@fluidframework/container-definitions";
import { IDisposable } from "@fluidframework/core-interfaces";
import { assert, Lazy } from "@fluidframework/core-utils/internal";
import { ISequencedDocumentMessage } from "@fluidframework/driver-definitions/internal";
import {
	ITelemetryLoggerExt,
	DataProcessingError,
	LoggingError,
	extractSafePropertiesFromMessage,
} from "@fluidframework/telemetry-utils/internal";
import Deque from "double-ended-queue";
import { v4 as uuid } from "uuid";

import { type InboundSequencedContainerRuntimeMessage } from "./messageTypes.js";
import { asBatchMetadata, IBatchMetadata } from "./metadata.js";
import { BatchId, BatchMessage, generateBatchId } from "./opLifecycle/index.js";
import { pkgVersion } from "./packageVersion.js";

/**
 * This represents a message that has been submitted and is added to the pending queue when `submit` is called on the
 * ContainerRuntime. This message has either not been ack'd by the server or has not been submitted to the server yet.
 *
 * @remarks This is the current serialization format for pending local state when a Container is serialized.
 */
export interface IPendingMessage {
	type: "message";
	referenceSequenceNumber: number;
	content: string;
	localOpMetadata: unknown;
	opMetadata: Record<string, unknown> | undefined;
	sequenceNumber?: number;
	/** Info needed to compute the batchId on reconnect */
	batchIdContext: {
		/** The Batch's original clientId, from when it was first flushed to be submitted */
		clientId: string;
		/**
		 * The Batch's original clientSequenceNumber, from when it was first flushed to be submitted
		 *	@remarks A negative value means it was not yet submitted when queued here (e.g. disconnected right before flush fired)
		 */
		batchStartCsn: number;
	};
}

type Patch<T, U> = U & Omit<T, keyof U>;

/** First version of the type (pre-dates batchIdContext) */
type IPendingMessageV0 = Patch<IPendingMessage, { batchIdContext?: undefined }>;

/**
 * Union of all supported schemas for when applying stashed ops
 *
 * @remarks When the format changes, this type should update to reflect all possible schemas.
 */
type IPendingMessageFromStash = IPendingMessageV0 | IPendingMessage;

export interface IPendingLocalState {
	/**
	 * list of pending states, including ops and batch information
	 */
	pendingStates: IPendingMessage[];
}

/** Info needed to replay/resubmit a pending message */
export type PendingMessageResubmitData = Pick<
	IPendingMessage,
	"content" | "localOpMetadata" | "opMetadata"
>;

export interface IRuntimeStateHandler {
	connected(): boolean;
	clientId(): string | undefined;
	close(error?: ICriticalContainerError): void;
	applyStashedOp(content: string): Promise<unknown>;
	reSubmitBatch(batch: PendingMessageResubmitData[], batchId: BatchId): void;
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

function withoutLocalOpMetadata(message: IPendingMessage): IPendingMessage {
	return {
		...message,
		localOpMetadata: undefined,
	};
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
	/** Messages that will need to be resubmitted if not ack'd before the next reconnection */
	private readonly pendingMessages = new Deque<IPendingMessage>();
	/** Messages stashed from a previous container, now being rehydrated. Need to be resubmitted. */
	private readonly initialMessages = new Deque<IPendingMessageFromStash>();

	/**
	 * Sequenced local ops that are saved when stashing since pending ops may depend on them
	 */
	private savedOps: IPendingMessage[] = [];

	/** Used to stand in for batchStartCsn for messages that weren't submitted (so no CSN) */
	private negativeCounter: number = -1;

	private readonly disposeOnce = new Lazy<void>(() => {
		this.initialMessages.clear();
		this.pendingMessages.clear();
	});

	// Indicates whether we are processing a batch.
	private isProcessingBatch: boolean = false;

	// This stores the first message in the batch that we are processing. This is used to verify that we get
	// the correct batch metadata.
	private pendingBatchBeginMessage: ISequencedDocumentMessage | undefined;

	/** Used to ensure we don't replay ops on the same connection twice */
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

	public getLocalState(snapshotSequenceNumber?: number): IPendingLocalState {
		assert(
			this.initialMessages.isEmpty(),
			0x2e9 /* "Must call getLocalState() after applying initial states" */,
		);
		// Using snapshot sequence number to filter ops older than our latest snapshot.
		// Such ops should not be declared in pending/stashed state. Snapshot seq num will not
		// be available when the container is not attached. Therefore, no filtering is needed.
		const newSavedOps = [...this.savedOps].filter((message) => {
			assert(
				message.sequenceNumber !== undefined,
				0x97c /* saved op should already have a sequence number */,
			);
			return message.sequenceNumber > (snapshotSequenceNumber ?? 0);
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
			pendingStates: [
				...newSavedOps,
				...this.pendingMessages.toArray().map(withoutLocalOpMetadata),
			],
		};
	}

	constructor(
		private readonly stateHandler: IRuntimeStateHandler,
		stashedLocalState: IPendingLocalState | undefined,
		private readonly logger: ITelemetryLoggerExt,
	) {
		if (stashedLocalState?.pendingStates) {
			this.initialMessages.push(...stashedLocalState.pendingStates);
		}
	}

	public get disposed() {
		return this.disposeOnce.evaluated;
	}
	public readonly dispose = () => this.disposeOnce.value;

	/**
	 * The given batch has been flushed, and needs to be tracked locally until the corresponding
	 * acks are processed, to ensure it is successfully sent.
	 * @param batch - The batch that was flushed
	 * @param clientSequenceNumber - The CSN of the first message in the batch,
	 * or undefined if the batch was not yet sent (e.g. by the time we flushed we lost the connection)
	 */
	public onFlushBatch(batch: BatchMessage[], clientSequenceNumber: number | undefined) {
		// If we're connected this is the client of the current connection,
		// otherwise it's the clientId that just disconnected
		// It's only undefined if we've NEVER connected. This is a tight corner case and we can
		// simply make up a unique ID in this case.
		const clientId = this.stateHandler.clientId() ?? uuid();

		// If the batch was not yet sent, we need to assign a unique batchStartCsn
		// Use a negative number to distinguish these from real CSNs
		const batchStartCsn = clientSequenceNumber ?? this.negativeCounter--;

		for (const message of batch) {
			const {
				contents: content = "",
				referenceSequenceNumber,
				localOpMetadata,
				metadata: opMetadata,
			} = message;
			const pendingMessage: IPendingMessage = {
				type: "message",
				referenceSequenceNumber,
				content,
				localOpMetadata,
				opMetadata,
				// Note: We only need this on the first message.
				batchIdContext: { clientId, batchStartCsn },
			};
			this.pendingMessages.push(pendingMessage);
		}
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
					patchBatchIdContext(nextMessage); // Back compat
					this.pendingMessages.push(nextMessage);
				}
			} catch (error) {
				throw DataProcessingError.wrapIfUnrecognized(error, "applyStashedOp", nextMessage);
			}
		}
	}

	/**
	 * Processes the incoming batch from the server. It verifies that messages are received in the right order and
	 * that the batch information is correct.
	 * @param batch - The batch that is being processed.
	 * @param batchStartCsn - The clientSequenceNumber of the start of this message's batch
	 */
	public processPendingLocalBatch(
		batch: InboundSequencedContainerRuntimeMessage[],
		batchStartCsn: number,
	): {
		message: InboundSequencedContainerRuntimeMessage;
		localOpMetadata: unknown;
	}[] {
		return batch.map((message) => ({
			message,
			localOpMetadata: this.processPendingLocalMessage(message, batchStartCsn),
		}));
	}

	/**
	 * Processes a local message once its ack'd by the server. It verifies that there was no data corruption and that
	 * the batch information was preserved for batch messages.
	 * @param message - The message that got ack'd and needs to be processed.
	 * @param batchStartCsn - The clientSequenceNumber of the start of this message's batch (assigned during submit)
	 * (not to be confused with message.clientSequenceNumber - the overwritten value in case of grouped batching)
	 */
	private processPendingLocalMessage(
		message: InboundSequencedContainerRuntimeMessage,
		batchStartCsn: number,
	): unknown {
		// Get the next message from the pending queue. Verify a message exists.
		const pendingMessage = this.pendingMessages.peekFront();
		assert(
			pendingMessage !== undefined,
			0x169 /* "No pending message found for this remote message" */,
		);

		// This may be the start of a batch.
		this.maybeProcessBatchBegin(message, batchStartCsn, pendingMessage);

		pendingMessage.sequenceNumber = message.sequenceNumber;
		this.savedOps.push(withoutLocalOpMetadata(pendingMessage));

		this.pendingMessages.shift();

		const messageContent = buildPendingMessageContent(message);

		// Stringified content should match
		if (pendingMessage.content !== messageContent) {
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
	 * @param batchStartCsn - The clientSequenceNumber of the start of this message's batch (assigned during submit)
	 * @param pendingMessage - The corresponding pendingMessage.
	 */
	private maybeProcessBatchBegin(
		message: ISequencedDocumentMessage,
		batchStartCsn: number,
		pendingMessage: IPendingMessage,
	) {
		if (!this.isProcessingBatch) {
			// Expecting the start of a batch (maybe single-message).
			if (pendingMessage.batchIdContext.batchStartCsn !== batchStartCsn) {
				this.logger?.sendErrorEvent({
					eventName: "BatchClientSequenceNumberMismatch",
					details: {
						processingBatch: !!this.pendingBatchBeginMessage,
						pendingBatchCsn: pendingMessage.batchIdContext.batchStartCsn,
						batchStartCsn,
						messageBatchMetadata: (message.metadata as any)?.batch,
						pendingMessageBatchMetadata: (pendingMessage.opMetadata as any)?.batch,
					},
					messageDetails: extractSafePropertiesFromMessage(message),
				});
			}
		}

		// This message is the first in a batch if the "batch" property on the metadata is set to true
		if ((message.metadata as IBatchMetadata | undefined)?.batch) {
			// We should not already be processing a batch and there should be no pending batch begin message.
			assert(
				!this.isProcessingBatch && this.pendingBatchBeginMessage === undefined,
				0x16b /* "The pending batch state indicates we are already processing a batch" */,
			);

			// Set the pending batch state indicating we have started processing a batch.
			this.pendingBatchBeginMessage = message;
			this.isProcessingBatch = true;
		}
	}

	/**
	 * This message could be the last message in batch. If so, clear batch state since the batch is complete.
	 * @param message - The message that is being processed.
	 */
	private maybeProcessBatchEnd(message: ISequencedDocumentMessage) {
		if (!this.isProcessingBatch) {
			return;
		}

		// There should be a pending batch begin message.
		assert(
			this.pendingBatchBeginMessage !== undefined,
			0x16d /* "There is no pending batch begin message" */,
		);

		const batchEndMetadata = (message.metadata as IBatchMetadata | undefined)?.batch;
		if (this.pendingMessages.isEmpty() || batchEndMetadata === false) {
			// Get the batch begin metadata from the first message in the batch.
			const batchBeginMetadata = (
				this.pendingBatchBeginMessage.metadata as IBatchMetadata | undefined
			)?.batch;

			// There could be just a single message in the batch. If so, it should not have any batch metadata. If there
			// are multiple messages in the batch, verify that we got the correct batch begin and end metadata.
			if (this.pendingBatchBeginMessage === message) {
				assert(
					batchBeginMetadata === undefined,
					0x16e /* "Batch with single message should not have batch metadata" */,
				);
			} else {
				if (batchBeginMetadata !== true || batchEndMetadata !== false) {
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
								hasBatchStart: batchBeginMetadata === true,
								hasBatchEnd: batchEndMetadata === false,
								messageType: message.type,
								pendingMessagesCount: this.pendingMessagesCount,
							},
						),
					);
				}
			}

			// Clear the pending batch state now that we have processed the entire batch.
			this.pendingBatchBeginMessage = undefined;
			this.isProcessingBatch = false;
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

			const batchMetadataFlag = asBatchMetadata(pendingMessage.opMetadata)?.batch;
			assert(batchMetadataFlag !== false, 0x41b /* We cannot process batches in chunks */);

			// The next message starts a batch (possibly single-message), and we'll need its batchId.
			// We'll find batchId on this message if it was previously generated.
			// Otherwise, generate it now - this is the first time resubmitting this batch.
			const batchId =
				asBatchMetadata(pendingMessage.opMetadata)?.batchId ??
				generateBatchId(
					pendingMessage.batchIdContext.clientId,
					pendingMessage.batchIdContext.batchStartCsn,
				);

			/**
			 * We must preserve the distinct batches on resubmit.
			 * Note: It is not possible for the PendingStateManager to receive a partially acked batch. It will
			 * either receive the whole batch ack or nothing at all.  @see ScheduleManager for how this works.
			 */
			if (batchMetadataFlag === undefined) {
				// Single-message batch

				this.stateHandler.reSubmitBatch(
					[
						{
							content: pendingMessage.content,
							localOpMetadata: pendingMessage.localOpMetadata,
							opMetadata: pendingMessage.opMetadata,
						},
					],
					batchId,
				);
				continue;
			}
			// else: batchMetadataFlag === true  (It's a typical multi-message batch)

			assert(
				remainingPendingMessagesCount > 0,
				0x554 /* Last pending message cannot be a batch begin */,
			);

			const batch: PendingMessageResubmitData[] = [];

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

/** For back-compat if trying to apply stashed ops that pre-date batchIdContext */
function patchBatchIdContext(
	message: IPendingMessageFromStash,
): asserts message is IPendingMessage {
	const batchIdContext: IPendingMessageFromStash["batchIdContext"] = message.batchIdContext;
	if (batchIdContext === undefined) {
		// Using uuid guarantees uniqueness, retaining existing behavior
		message.batchIdContext = { clientId: uuid(), batchStartCsn: -1 };
	}
}
