import { getStyle } from "@chaincode/flow-document";
import { TextSegment } from "@prague/merge-tree";
/**
 * Used by the DocumentView to concatenate adjacent text segments that share the same style.  These should be
 * rendered using a single <span> element to preserve kerning & ligatures.
 */
export class TextAccumulator {
    constructor(position, first, startOffset, relativeEndOffset) {
        this.segments = [];
        // tslint:disable-next-line:variable-name
        this._text = "";
        // tslint:disable-next-line:variable-name
        this._nextPosition = NaN;
        this.tryConcat = (position, segment, relativeStartOffset, relativeEndOffset) => {
            console.assert(position === this._nextPosition);
            // Terminate if the next segment is not a text segment.
            if (!(segment instanceof TextSegment)) {
                return false;
            }
            // Terminate if the next text segment uses a different style (i.e., needs a separate <span>.)
            if (getStyle(segment) !== this.style) {
                return false;
            }
            this.segments.push(segment);
            // Clamp the relative start/end offsets to the range of offsets included in the current TextSegment.
            const startOffset = Math.max(0, relativeStartOffset);
            const endOffset = Math.min(relativeEndOffset, segment.text.length);
            this._text += segment.text.slice(startOffset, endOffset);
            this._nextPosition = position + endOffset;
            return true;
        };
        this.style = getStyle(first);
        this.startPosition = Math.max(position, position + startOffset);
        this._nextPosition = position;
        this.tryConcat(position, first, startOffset, relativeEndOffset);
    }
    get text() { return this._text; }
    get nextPosition() { return this._nextPosition; }
}
//# sourceMappingURL=textaccumulator.js.map