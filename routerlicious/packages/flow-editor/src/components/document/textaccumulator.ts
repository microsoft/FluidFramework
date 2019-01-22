import { TextSegment, ISegment, SegmentType } from "@prague/merge-tree";
import { getStyle } from "@chaincode/flow-document";

/** 
 * Used by the DocumentView to concatenate adjacent text segments that share the same style.  These should be
 * rendered using a single <span> element to preserve kerning & ligatures.
 */
export class TextAccumulator {
    public readonly style: CSSStyleDeclaration;
    public readonly segments: TextSegment[] = [];
    public readonly startPosition: number;
    private _text = "";
    private _nextPosition = NaN;

    constructor (position: number, first: TextSegment, startOffset: number, relativeEndOffset: number) {
        this.style = getStyle(first);
        this.startPosition = Math.max(position, position + startOffset);
        this._nextPosition = position;
        this.tryConcat(position, first, startOffset, relativeEndOffset);
    }

    public readonly tryConcat = (position: number, segment: ISegment, relativeStartOffset: number, relativeEndOffset: number) => {
        console.assert(position === this._nextPosition);
        
        // Terminate if the next segment is not a text segment.
        if (segment.getType() !== SegmentType.Text) {
            return false;
        }
        
        // Terminate if the next text segment uses a different style (i.e., needs a separate <span>.)
        const asText = segment as TextSegment;
        if (getStyle(asText) !== this.style) {
            return false;
        }

        this.segments.push(asText);

        // Clamp the relative start/end offsets to the range of offsets included in the current TextSegment.
        const startOffset = Math.max(0, relativeStartOffset);
        const endOffset = Math.min(relativeEndOffset, asText.text.length);
        this._text += asText.text.slice(startOffset, endOffset);
        this._nextPosition = position + endOffset;        
        return true;
    }

    public get text() { return this._text; }
    public get nextPosition() { return this._nextPosition; }
}