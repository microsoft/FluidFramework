/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	ISequencedDocumentSystemMessage,
	ISequencedDocumentMessage,
} from "@fluidframework/driver-definitions/internal";

import type { ContainerRuntimeExternalOp } from "./messageTypes.js";

export const opSize = (op: ISequencedDocumentMessage): number => {
	// Some messages may already have string contents,
	// so stringifying them again will add inaccurate overhead.
	const content =
		typeof op.contents === "string" ? op.contents : JSON.stringify(op.contents) ?? "";
	const data = opHasData(op) ? op.data : "";
	return content.length + data.length;
};

const opHasData = (op: ISequencedDocumentMessage): op is ISequencedDocumentSystemMessage =>
	(op as ISequencedDocumentSystemMessage).data !== undefined;

/**
 * Interface to add op and stashed op processor to container runtime so as to process external
 * ops which could be submitted as part of different features.
 * @alpha
 * @legacy
 */
export interface IExternalOpProcessor {
	/**
	 * External Op Processor.
	 * @param op - External op to be processed.
	 * @returns - True if this op processor recognizes this op and processed it.
	 */
	opProcessor: (
		op: ContainerRuntimeExternalOp,
		local: boolean,
		localOpMetadata?: unknown,
	) => boolean;

	/**
	 * Corresponding external stashed Op Processor.
	 * @param op - External stashed op to be processed.
	 * @returns - True if this stashed op processor recognizes this op and processed it.
	 */
	stashedOpProcessor: (op: ContainerRuntimeExternalOp) => Promise<boolean>;
}
