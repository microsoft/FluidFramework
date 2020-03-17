/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import { ISegment } from "@microsoft/fluid-merge-tree";
export declare class SegmentSpan {
    get segments(): readonly ISegment[];
    get startOffset(): number;
    get startPosition(): number;
    get endPosition(): number;
    get isEmpty(): boolean;
    get firstSegment(): ISegment;
    get lastSegment(): ISegment;
    get length(): number;
    private firstPosition;
    private lastPosition;
    private readonly _segments;
    private _endOffset;
    private _startOffset;
    constructor(position?: number, segment?: ISegment, startOffset?: number, endOffset?: number);
    forEach(callback: (position: number, segment: ISegment, startOffset: number, endOffset: number) => boolean | undefined): void;
    append(position: number, segment: ISegment, startOffset: number, endOffset: number): void;
    /**
     * Given an offset from the beginning of the span, returns the segment that contains the offset
     * as well as the offset from the segment start.
     */
    spanOffsetToSegmentOffset(spanOffset: number): {
        segment: ISegment;
        offset: number;
    };
}
//# sourceMappingURL=segmentspan.d.ts.map