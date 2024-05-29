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
	metadata?: Record<string, unknown>;
	compression?: string;
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
	public groupBatch(batch: IBatch): IBatch<[BatchMessage]> {
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
				metadata: message.metadata,
				compression: message.compression,
			})),
		});

		const groupedBatch: IBatch<[BatchMessage]> = {
			...batch,
			content: [
				{
					metadata: undefined,
					referenceSequenceNumber: batch.content[0].referenceSequenceNumber,
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
