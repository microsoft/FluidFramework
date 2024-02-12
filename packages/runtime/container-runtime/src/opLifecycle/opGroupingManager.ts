/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils";
import { ISequencedDocumentMessage } from "@fluidframework/protocol-definitions";
import { createChildLogger } from "@fluidframework/telemetry-utils";
import { ITelemetryBaseLogger } from "@fluidframework/core-interfaces";
import { ContainerMessageType } from "../messageTypes";
import { IBatch } from "./definitions";

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

	public groupBatch(batch: IBatch): IBatch {
		if (!this.shouldGroup(batch)) {
			return batch;
		}

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

		const groupedBatch: IBatch = {
			...batch,
			content: [
				{
					localOpMetadata: undefined,
					metadata: undefined,
					referenceSequenceNumber: batch.content[0].referenceSequenceNumber,
					contents: serializedContent,
					type: OpGroupingManager.groupedBatchOp as ContainerMessageType,
				},
			],
		};
		return groupedBatch;
	}

	private lastSeenSeqNum = -1;
	public ungroupOp(op: ISequencedDocumentMessage): ISequencedDocumentMessage[] {
		let fakeCsn = 1;
		if (!isGroupContents(op.contents)) {
			// Align the worlds of what clientSequenceNumber represents when grouped batching is enabled
			// If lastSeenSeqNum is a match, we know we already processed this op
			if (this.config.groupedBatchingEnabled && op.sequenceNumber !== this.lastSeenSeqNum) {
				this.lastSeenSeqNum = op.sequenceNumber;
				return [
					{
						...op,
						clientSequenceNumber: fakeCsn,
					},
				];
			}
			return [op];
		}

		const messages = op.contents.contents;
		return messages.map((subMessage) => ({
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
