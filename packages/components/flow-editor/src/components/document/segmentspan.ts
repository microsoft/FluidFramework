// tslint:disable:variable-name
// tslint:disable:no-this-assignment
// tslint:disable:binary-expression-operand-order

import { ISegment } from "@prague/merge-tree";
import { IFlowViewComponent } from "..";

export class ViewInfo<TProps, TView extends IFlowViewComponent<TProps>> {
    constructor(
        public readonly view: TView,
        public span: SegmentSpan,
    ) { }
}

export class SegmentSpan {
    private firstPosition = NaN;
    private lastPosition = NaN;
    private readonly _segments = [];
    private _endOffset = NaN;
    private _startOffset = NaN;

    public get segments(): ReadonlyArray<ISegment> { return this._segments; }
    public get startOffset() { return this._startOffset; }
    public get startPosition() { return this.firstPosition + this._startOffset; }
    public get endPosition() { return this.lastPosition + Math.min(this._endOffset, this.lastSegment.cachedLength); }
    public get isEmpty() { return isNaN(this.firstPosition); }

    public forEach(callback: (position: number, segment: ISegment, startOffset: number, endOffset: number) => boolean | undefined) {
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

    public get firstSegment() { return this.segments[0]; }
    public get lastSegment() { return this.segments[this.segments.length - 1]; }

    public append(position: number, segment: ISegment, startOffset: number, endOffset: number) {
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
}
