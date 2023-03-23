/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ISequencedDocumentMessage } from "@fluidframework/protocol-definitions";
import { BatchMessage, IBatch } from "./definitions";

export class OpGroupingManager {
	static groupedBatchOp = "groupedBatch";

	constructor(private readonly groupedBatchingEnabled: boolean) {}

	public groupBatch(batch: IBatch): IBatch {
		if (batch.content.length < 2 || !this.groupedBatchingEnabled) {
			return batch;
		}
		const groupedBatch: IBatch = {
			...batch,
			content: [
				{
					...batch.content[0],
					metadata: undefined, // important to not keep reference to first op's batch metadata
					compression: undefined,
					// deserializedContent: ,
					contents: JSON.stringify({
						type: OpGroupingManager.groupedBatchOp,
						contents: batch.content.map((message) => ({
							...message,
							contents: undefined, // So we don't duplicate content
						})),
					}),
				},
			],
		};
		return groupedBatch;
	}

	public ungroupOp(op: ISequencedDocumentMessage): ISequencedDocumentMessage[] {
		if (
			!op.contents ||
			typeof op.contents !== "object" ||
			op.contents.type !== OpGroupingManager.groupedBatchOp
		) {
			return [op];
		}

		const messages = op.contents.contents as BatchMessage[];
		let fakeCsn = 1;
		return messages.map((subMessage) => ({
			...op,
			clientSequenceNumber: fakeCsn++,
			contents: subMessage.deserializedContent.contents,
			type: subMessage.deserializedContent.type,
			metadata: subMessage.metadata,
			compression: subMessage.compression,
		}));
	}
}
