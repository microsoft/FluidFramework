/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ITelemetryBaseLogger } from "@fluidframework/core-interfaces";
import { assert } from "@fluidframework/core-utils/internal";
import { ISequencedDocumentMessage } from "@fluidframework/driver-definitions/internal";
import {
	createChildLogger,
	type ITelemetryLoggerExt,
} from "@fluidframework/telemetry-utils/internal";

import type { LocalContainerRuntimeMessage } from "../messageTypes.js";

import {
	IBatch,
	type LocalBatch,
	type LocalBatchMessage,
	type OutboundSingletonBatch,
} from "./definitions.js";

/**
 * Grouping makes assumptions about the shape of message contents. This interface codifies those assumptions, but does not validate them.
 */
interface IGroupedBatchMessageContents {
	type: typeof OpGroupingManager.groupedBatchOp;
	contents: IGroupedMessage[];
}

interface IGroupedMessage {
	contents?: unknown; //* Revisit name/type
	metadata?: Record<string, unknown>;
	compression?: string;
}

function isGroupContents(opContents: unknown): opContents is IGroupedBatchMessageContents {
	return (
		(opContents as Partial<IGroupedBatchMessageContents>)?.type ===
		OpGroupingManager.groupedBatchOp
	);
}

export function isGroupedBatch(op: ISequencedDocumentMessage): boolean {
	return isGroupContents(op.contents);
}

export interface OpGroupingManagerConfig {
	readonly groupedBatchingEnabled: boolean;
}

export class OpGroupingManager {
	static readonly groupedBatchOp = "groupedBatch";
	private readonly logger: ITelemetryLoggerExt;

	constructor(
		private readonly config: OpGroupingManagerConfig,
		logger: ITelemetryBaseLogger,
	) {
		this.logger = createChildLogger({ logger, namespace: "OpGroupingManager" });
	}

	/**
	 * Creates a new batch with a single message of type "groupedBatch" and empty contents.
	 * This is needed as a placeholder if a batch becomes empty on resubmit, but we are tracking batch IDs.
	 * @param resubmittingBatchId - batch ID of the resubmitting batch
	 * @param referenceSequenceNumber - reference sequence number
	 * @returns - IBatch containing a single empty Grouped Batch op
	 */
	public createEmptyGroupedBatch(
		resubmittingBatchId: string,
		referenceSequenceNumber: number,
	): IBatch<[LocalBatchMessage]> {
		//* This seems wrong, regular Grouped Batches are Outbound
		assert(
			this.config.groupedBatchingEnabled,
			0xa00 /* cannot create empty grouped batch when grouped batching is disabled */,
		);
		const serializedOp = JSON.stringify({
			type: OpGroupingManager.groupedBatchOp, //* Could be a different "emptyBatch" type?
			contents: [],
		} satisfies LocalContainerRuntimeMessage);

		return {
			contentSizeInBytes: 0,
			messages: [
				{
					metadata: { batchId: resubmittingBatchId },
					localOpMetadata: { emptyBatch: true },
					referenceSequenceNumber,
					serializedOp,
				},
			],
			referenceSequenceNumber,
		};
	}

	/**
	 * Converts the given batch into a "grouped batch" - a batch with a single message of type "groupedBatch",
	 * with contents being an array of the original batch's messages.
	 *
	 * If the batch already has only 1 message, it is returned as-is.
	 *
	 * @remarks - Remember that a BatchMessage has its content JSON serialized, so the incoming batch message contents
	 * must be parsed first, and then the type and contents mentioned above are hidden in that JSON serialization.
	 */
	public groupBatch(batch: LocalBatch): OutboundSingletonBatch {
		assert(this.groupedBatchingEnabled(), "grouping disabled!");
		assert(batch.messages.length > 0, "Unexpected attempt to group an empty batch");

		if (batch.messages.length === 1) {
			//* We need to actuall convert between the two somewhere
			return batch as OutboundSingletonBatch;
		}

		if (batch.messages.length >= 1000) {
			this.logger.sendTelemetryEvent({
				eventName: "GroupLargeBatch",
				length: batch.messages.length,
				reentrant: batch.hasReentrantOps,
				referenceSequenceNumber: batch.messages[0].referenceSequenceNumber,
			});
		}
		// We expect this will be on the first message, if present at all.
		let groupedBatchId;
		for (const message of batch.messages) {
			if (message.metadata) {
				const { batch: _batch, batchId, ...rest } = message.metadata;
				if (batchId) {
					groupedBatchId = batchId;
				}
				assert(Object.keys(rest).length === 0, 0x5dd /* cannot group ops with metadata */);
			}
		}

		const serializedContent = JSON.stringify({
			type: OpGroupingManager.groupedBatchOp,
			contents: batch.messages.map<IGroupedMessage>((message) => ({
				contents: message.serializedOp,
				metadata: message.metadata,
				compression: message.compression,
			})),
		});

		const groupedBatch: OutboundSingletonBatch = {
			...batch,
			messages: [
				{
					metadata: { batchId: groupedBatchId },
					referenceSequenceNumber: batch.messages[0].referenceSequenceNumber,
					contents: serializedContent,
				},
			],
		};
		return groupedBatch;
	}

	public ungroupOp(op: ISequencedDocumentMessage): ISequencedDocumentMessage[] {
		assert(isGroupContents(op.contents), 0x947 /* can only ungroup a grouped batch */);
		const contents: IGroupedBatchMessageContents = op.contents;

		let fakeCsn = 1;
		return contents.contents.map((subMessage) => ({
			...op,
			clientSequenceNumber: fakeCsn++,
			contents: subMessage.contents,
			metadata: subMessage.metadata,
			compression: subMessage.compression,
		}));
	}

	public groupedBatchingEnabled(): boolean {
		return this.config.groupedBatchingEnabled;
	}
}
