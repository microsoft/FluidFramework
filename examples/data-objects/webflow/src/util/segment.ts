/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ISegment } from "@fluidframework/merge-tree";

export function getSegmentRange(position: number, segment: ISegment, startOffset = 0) {
    const start = position - Math.max(startOffset, 0);
    return { start, end: start + segment.cachedLength };
}
