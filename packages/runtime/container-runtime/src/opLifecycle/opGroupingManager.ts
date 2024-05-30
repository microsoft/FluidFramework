/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { v4 as uuid } from "uuid";
import { ITelemetryBaseLogger } from "@fluidframework/core-interfaces";
import { assert } from "@fluidframework/core-utils/internal";
import { ISequencedDocumentMessage } from "@fluidframework/driver-definitions";
import { createChildLogger } from "@fluidframework/telemetry-utils/internal";

import { IBatch, type GroupedBatchMessage } from "./definitions.js";

/**
 * Grouping makes assumptions about the shape of message contents. This interface codifies those assumptions, but does not validate them.
 */
interface IGroupedBatchMessageContents {
	type: typeof OpGroupingManager.groupedBatchOp;
	contents: IGroupedMessage[];
}

interface IGroupedMessage {
	contents?: unknown;
	metadata?: Record<string, unknown>; //* only would be batch metadata for first/last
	compression?: string; //* N/A because we compress after grouping now
}

function isGroupContents(opContents: any): opContents is IGroupedBatchMessageContents {
	return opContents?.type === OpGroupingManager.groupedBatchOp;
}

export function isGroupedBatch(
	op: ISequencedDocumentMessage,
	//* DEBUG: Probably wrong
): op is ISequencedDocumentMessage & { metadata: { batchId: string } } {
	return isGroupContents(op.contents);
}

export interface OpGroupingManagerConfig {
	//* Always true for prototype. If false, disable serialization w/o closing.  (will be a pain to support both modes in PSM etc...)
	readonly groupedBatchingEnabled: boolean;
	readonly opCountThreshold: number;
	readonly reentrantBatchGroupingEnabled: boolean;
}

export class OpGroupingManager {
	static readonly groupedBatchOp = "groupedBatch";
	private readonly logger;

	constructor(
		private readonly config: OpGroupingManagerConfig,
		logger: ITelemetryBaseLogger,
	) {
		this.logger = createChildLogger({ logger, namespace: "OpGroupingManager" });
	}

	/**
	 * Converts the given batch into a "grouped batch" - a batch with a single message of type "groupedBatch",
	 * with contents being an array of the original batch's messages.
	 *
	 * @remarks - Remember that a BatchMessage has its content JSON serialized, so the incoming batch message contents
	 * must be parsed first, and then the type and contents mentioned above are hidden in that JSON serialization.
	 */
	public groupBatch(batch: IBatch): IBatch<[GroupedBatchMessage]> {
		assert(this.shouldGroup(batch), 0x946 /* cannot group the provided batch */);

		if (batch.content.length >= 1000) {
			this.logger.sendTelemetryEvent({
				eventName: "GroupLargeBatch",
				length: batch.content.length,
				threshold: this.config.opCountThreshold,
				reentrant: batch.hasReentrantOps,
				referenceSequenceNumber: batch.content[0].referenceSequenceNumber,
			});
		}

		for (const message of batch.content) {
			if (message.metadata) {
				const keys = Object.keys(message.metadata);
				assert(keys.length < 2, 0x5dd /* cannot group ops with metadata */);
				assert(
					keys.length === 0 || keys[0] === "batch",
					0x5de /* unexpected op metadata */,
				);
			}
		}

		const serializedContent = JSON.stringify({
			type: OpGroupingManager.groupedBatchOp,
			contents: batch.content.map<IGroupedMessage>((message) => ({
				contents: message.contents === undefined ? undefined : JSON.parse(message.contents),
				metadata: message.metadata, //* Boring - just the batch metadata at front/back
				compression: message.compression, //* Won't be set because we compress after grouping now
			})),
		});

		const groupedBatch: IBatch<[GroupedBatchMessage]> = {
			...batch,
			content: [
				{
					metadata: { batchId: uuid() },
					referenceSequenceNumber: batch.content[0].referenceSequenceNumber,
					contents: serializedContent, //* it's IGroupedBatchMessageContents
				},
			],
		};
		return groupedBatch;
	}

	/**
	 * Ungroups the given op, returning an array of the sub-ops that were grouped together.
	 * @param op - incoming op (unchunked and uncompressed) to ungroup
	 * @param loms - If the op is local (based on loader's understanding), this should be an array of localOpMetadata, one-to-one with the batched messages
	 */
	public ungroupOp(op: ISequencedDocumentMessage, loms?: unknown[]): ISequencedDocumentMessage[] {
		assert(isGroupContents(op.contents), 0x947 /* can only ungroup a grouped batch */);
		const contents: IGroupedBatchMessageContents = op.contents;

		// This would indicate the pending batch had a different length than the incoming batch
		// Shouldn't happen if ref seq matches
		assert(
			loms === undefined || //* This means not local
				contents.contents.length === loms.length,
			"If local, should have localOpMetadata for each batched message",
		);

		let fakeCsn = 1;
		return contents.contents.map((subMessage, i) => ({
			...op,
			clientSequenceNumber: fakeCsn++,
			contents: subMessage.contents,
			metadata: subMessage.metadata,
			compression: subMessage.compression,
			localOpMetadata: loms?.[i], //* will correctly be undefined for non-local
		}));
	}

	public shouldGroup(batch: IBatch): boolean {
		return (
			// Grouped batching must be enabled
			this.config.groupedBatchingEnabled //* &&
			//* TODO: Do we need to support this? Will be great if we can always Group, to centralize batchId logic
			//* batch.content.length >= this.config.opCountThreshold &&
			//* TODO: Can we remove this feature gate?
			//* (this.config.reentrantBatchGroupingEnabled || batch.hasReentrantOps !== true)
		);
	}
}
