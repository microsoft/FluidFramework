/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
export class SegmentSpan {
    constructor(position, segment, startOffset, endOffset) {
        this.firstPosition = NaN;
        this.lastPosition = NaN;
        this._segments = [];
        this._endOffset = NaN;
        this._startOffset = NaN;
        if (position !== undefined) {
            this.append(position, segment, startOffset, endOffset);
        }
    }
    get segments() { return this._segments; }
    get startOffset() { return this._startOffset; }
    get startPosition() { return this.firstPosition + this._startOffset; }
    get endPosition() { return this.lastPosition + Math.min(this._endOffset, this.lastSegment.cachedLength); }
    get isEmpty() { return isNaN(this.firstPosition); }
    get firstSegment() { return this.segments[0]; }
    get lastSegment() { return this.segments[this.segments.length - 1]; }
    get length() { return this.endPosition - this.startPosition; }
    // eslint-disable-next-line max-len
    forEach(callback) {
        let startOffset = this._startOffset;
        let position = this.firstPosition;
        const final = this.endPosition;
        for (const segment of this.segments) {
            if (callback(position, segment, startOffset, Math.min(segment.cachedLength, final - position)) === false) {
                return;
            }
            position += segment.cachedLength;
            startOffset = 0;
        }
    }
    append(position, segment, startOffset, endOffset) {
        this._segments.push(segment);
        this.lastPosition = position;
        this._endOffset = endOffset;
        if (this.isEmpty) {
            this.firstPosition = position;
            // Note: The first segment appended to the span may not be the first segment in the iteration,
            //       in which case the startOffset will be negative.
            this._startOffset = Math.max(startOffset, 0);
        }
        console.assert(0 <= this._startOffset && this._startOffset <= segment.cachedLength);
        console.assert(0 <= this.startPosition && this.startPosition <= this.endPosition);
    }
    /**
     * Given an offset from the beginning of the span, returns the segment that contains the offset
     * as well as the offset from the segment start.
     */
    spanOffsetToSegmentOffset(spanOffset) {
        let currentSpanOffset = spanOffset;
        let segment;
        let offset = NaN;
        // Note: It is trivial to accelerate this using binary search.  To do so, construct a second
        //       array of cumulative span lengths when pushing each segment in 'append()'.
        this.forEach((position, candidate, startOffset, endOffset) => {
            segment = candidate;
            const len = endOffset - startOffset;
            offset = startOffset + currentSpanOffset;
            if (currentSpanOffset < len) {
                return false;
            }
            currentSpanOffset -= len;
            return true;
        });
        return { segment, offset };
    }
}
//# sourceMappingURL=segmentspan.js.map