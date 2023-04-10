/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/common-utils";
import { ISequencedDocumentMessage } from "@fluidframework/protocol-definitions";
import { ContainerRuntimeMessage } from "..";
import { IBatch } from "./definitions";

interface IGroupedMessage {
	contents?: unknown;
	metadata?: Record<string, unknown>;
	compression?: string;
}

export class OpGroupingManager {
	static groupedBatchOp = "groupedBatch";

	constructor(private readonly groupedBatchingEnabled: boolean) {}

	public groupBatch(batch: IBatch): IBatch {
		if (batch.content.length < 2 || !this.groupedBatchingEnabled) {
			return batch;
		}

		for (const message of batch.content) {
			if (message.metadata) {
				const keys = Object.keys(message.metadata);
				assert(keys.length < 2, "cannot group ops with metadata");
				assert(keys.length === 0 || keys[0] === "batch", "unexpected op metadata");
			}
		}

		// Need deserializedContent for back-compat
		const deserializedContent = {
			type: OpGroupingManager.groupedBatchOp,
			contents: batch.content.map<IGroupedMessage>((message) => ({
				contents: message.contents === undefined ? undefined : JSON.parse(message.contents),
				metadata: message.metadata,
				compression: message.compression,
			})),
		};

		const groupedBatch: IBatch = {
			...batch,
			content: [
				{
					localOpMetadata: undefined,
					metadata: undefined,
					referenceSequenceNumber: batch.content[0].referenceSequenceNumber,
					deserializedContent: deserializedContent as ContainerRuntimeMessage,
					contents: JSON.stringify(deserializedContent),
				},
			],
		};
		return groupedBatch;
	}

	public ungroupOp(op: ISequencedDocumentMessage): ISequencedDocumentMessage[] {
		if (op.contents?.type !== OpGroupingManager.groupedBatchOp) {
			return [op];
		}

		const messages = op.contents.contents as IGroupedMessage[];
		let fakeCsn = 1;
		return messages.map((subMessage) => ({
			...op,
			clientSequenceNumber: fakeCsn++,
			contents: subMessage.contents,
			metadata: subMessage.metadata,
			compression: subMessage.compression,
		}));
	}
}
