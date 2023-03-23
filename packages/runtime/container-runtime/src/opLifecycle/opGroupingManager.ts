/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ISequencedDocumentMessage } from "@fluidframework/protocol-definitions";
import { ContainerRuntimeMessage } from "..";
import { IBatch } from "./definitions";

interface IGroupedMessage {
	contents: string;
	metadata: Record<string, unknown> | undefined;
	compression: string;
}

export class OpGroupingManager {
	static groupedBatchOp = "groupedBatch";

	constructor(private readonly groupedBatchingEnabled: boolean) {}

	public groupBatch(batch: IBatch): IBatch {
		if (batch.content.length < 2 || !this.groupedBatchingEnabled) {
			return batch;
		}

		const deserializedContent = {
			type: OpGroupingManager.groupedBatchOp,
			contents: batch.content.map((message) => ({
				contents: message.contents,
				metadata: message.metadata,
				compression: message.compression,
			})),
		};

		const groupedBatch: IBatch = {
			...batch,
			content: [
				{
					...batch.content[0],
					metadata: undefined, // important to not keep reference to first op's batch metadata
					compression: undefined,
					deserializedContent: deserializedContent as ContainerRuntimeMessage,
					contents: JSON.stringify(deserializedContent),
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

		const messages = op.contents.contents as IGroupedMessage[];
		let fakeCsn = 1;
		return messages.map((subMessage) => ({
			...op,
			clientSequenceNumber: fakeCsn++,
			contents:
				subMessage.contents === undefined ? undefined : JSON.parse(subMessage.contents),
			metadata: subMessage.metadata,
			compression: subMessage.compression,
		}));
	}
}
