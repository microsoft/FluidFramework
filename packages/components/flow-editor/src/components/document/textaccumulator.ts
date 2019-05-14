import { ISegment, TextSegment } from "@prague/merge-tree";
import { SegmentSpan } from "./segmentspan";

/**
 * Used by the DocumentView to concatenate adjacent text segments that share the same style.  These should be
 * rendered using a single <span> element to preserve kerning & ligatures.
 */
export class TextAccumulator {
    constructor(private readonly span: SegmentSpan) { }

    public readonly tryConcat = (position: number, segment: ISegment, startOffset: number, endOffset: number) => {
        const span = this.span;
        console.assert(span.isEmpty || span.endPosition === position);

        // Terminate if the next segment is not a text segment.
        if (!(segment instanceof TextSegment)) {
            return false;
        }

        this.span.append(position, segment, startOffset, endOffset);
        return true;
    }

    public get text() {
        const span = this.span;
        return span.segments.join("").substr(span.startOffset, span.endPosition - span.startPosition);
    }
}
