/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ISegment } from "@prague/merge-tree";

export function getSegmentRange(position: number, segment: ISegment, offset = 0) {
    const start = position - offset;
    return { start, end: start + segment.cachedLength };
}
