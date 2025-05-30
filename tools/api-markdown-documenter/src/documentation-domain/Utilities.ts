/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { LineBreakNode } from "./LineBreakNode.js";
import { PlainTextNode } from "./PlainTextNode.js";

/**
 * Splits plain text (potentially including line breaks) into {@link PlainTextNode}s and {@link LineBreakNode}s as
 * appropriate to preserve the invariant that `PlainTextNode`s do not include line breaks.
 */
export function createNodesFromPlainText(text: string): (PlainTextNode | LineBreakNode)[] {
	if (text.length === 0) {
		return [PlainTextNode.Empty];
	}

	const lines = text.split(/\r?\n/g);

	const transformedLines: (PlainTextNode | LineBreakNode)[] = [];
	for (const [index, line] of lines.entries()) {
		if (line.length === 0) {
			transformedLines.push(LineBreakNode.Singleton);
		} else {
			transformedLines.push(new PlainTextNode(line));
		}

		// Push line break between each entry (not after last entry)
		if (index !== lines.length - 1) {
			transformedLines.push(LineBreakNode.Singleton);
		}
	}
	return transformedLines;
}
