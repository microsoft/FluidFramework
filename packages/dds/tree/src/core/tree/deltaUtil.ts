/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { unreachableCase } from "@fluidframework/common-utils";
import { Mark, MarkType, Root, Skip } from "./delta";

export const emptyDelta: Root<never> = new Map();

/**
 * Returns the number of nodes in the input tree that the mark affects or skips.
 */
export function inputLength(mark: Mark<unknown>): number {
	if (isSkipMark(mark)) {
		return mark;
	}
	// Inline into `switch(mark.type)` once we upgrade to TS 4.7
	const type = mark.type;
	switch (type) {
		case MarkType.Delete:
		case MarkType.MoveOut:
			return mark.count;
		case MarkType.Insert:
		case MarkType.MoveIn:
			return 0;
		default:
			unreachableCase(type);
	}
}

export function isSkipMark(mark: Mark<unknown>): mark is Skip {
	return typeof mark === "number";
}
