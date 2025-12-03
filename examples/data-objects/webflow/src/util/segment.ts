/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ISegment } from "@fluidframework/sequence/legacy";

export function getSegmentRange(position: number, segment: ISegment, startOffset = 0) {
	const start = position - Math.max(startOffset, 0);
	return { start, end: start + segment.cachedLength };
}
