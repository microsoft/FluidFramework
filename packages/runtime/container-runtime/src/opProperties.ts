/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	ISequencedDocumentSystemMessage,
	ISequencedDocumentMessage,
} from "@fluidframework/driver-definitions/internal";

export const opSize = (op: ISequencedDocumentMessage): number => {
	// Some messages may already have string contents,
	// so stringifying them again will add inaccurate overhead.
	const content =
		typeof op.contents === "string" ? op.contents : (JSON.stringify(op.contents) ?? "");
	const data = opHasData(op) ? op.data : "";
	return content.length + data.length;
};

const opHasData = (op: ISequencedDocumentMessage): op is ISequencedDocumentSystemMessage =>
	(op as ISequencedDocumentSystemMessage).data !== undefined;
