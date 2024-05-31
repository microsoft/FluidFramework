/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ITelemetryBaseLogger } from "@fluidframework/core-interfaces";
import { assert } from "@fluidframework/core-utils/internal";
import { ISequencedDocumentMessage } from "@fluidframework/driver-definitions";
import { createChildLogger } from "@fluidframework/telemetry-utils/internal";

import { IBatch, type BatchMessage } from "./definitions.js";

/**
 * Grouping makes assumptions about the shape of message contents. This interface codifies those assumptions, but does not validate them.
 */
interface IGroupedBatchMessageContents {
	type: typeof OpGroupingManager.groupedBatchOp;
	contents: IGroupedMessage[];
}

interface IGroupedMessage {
	contents?: unknown;
	metadata?: Record<string, unknown> & { batch?: boolean; batchId?: string };
	compression?: string; //* N/A because we compress after grouping now
}

function isGroupContents(opContents: any): opContents is IGroupedBatchMessageContents {
	return opContents?.type === OpGroupingManager.groupedBatchOp;
}

export function isGroupedBatch(op: ISequencedDocumentMessage): boolean {
	return isGroupContents(op.contents);
}

export interface OpGroupingManagerConfig {
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
	public groupBatch(rawBatch: IBatch): IBatch<[BatchMessage]> {
		assert(this.shouldGroup(rawBatch), 0x946 /* cannot group the provided batch */);

		if (rawBatch.content.length >= 1000) {
			this.logger.sendTelemetryEvent({
				eventName: "GroupLargeBatch",
				length: rawBatch.content.length,
				threshold: this.config.opCountThreshold,
				reentrant: rawBatch.hasReentrantOps,
				referenceSequenceNumber: rawBatch.content[0].referenceSequenceNumber,
			});
		}

		for (const message of rawBatch.content) {
			if (message.metadata) {
				const { batch, batchId, ...rest } = message.metadata;
				assert(Object.keys(rest).length === 0, 0x5dd /* cannot group ops with metadata */);
			}
		}

		const serializedContent = JSON.stringify({
			type: OpGroupingManager.groupedBatchOp,
			contents: rawBatch.content.map<IGroupedMessage>((message) => ({
				contents: message.contents === undefined ? undefined : JSON.parse(message.contents),
				metadata: message.metadata, //* batch metadata including batchId (on first message only)
				compression: message.compression, //* Won't be set because we compress after grouping now
			})),
		});

		const groupedBatch: IBatch<[BatchMessage]> = {
			...rawBatch,
			content: [
				{
					metadata: undefined,
					referenceSequenceNumber: rawBatch.content[0].referenceSequenceNumber,
					contents: serializedContent, //* it's IGroupedBatchMessageContents
				},
			],
		};
		return groupedBatch;
	}

	/**
	 * Ungroups the given op, returning an array of the sub-ops that were grouped together.
	 * @param op - incoming op (unchunked and uncompressed) to ungroup
	 */
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

	public shouldGroup(batch: IBatch): boolean {
		return (
			// Grouped batching must be enabled
			this.config.groupedBatchingEnabled &&
			// The number of ops in the batch must surpass the configured threshold
			batch.content.length >= this.config.opCountThreshold &&
			// Support for reentrant batches must be explicitly enabled
			(this.config.reentrantBatchGroupingEnabled || batch.hasReentrantOps !== true)
		);
	}
}
