import { ISegment, TextSegment } from "@prague/merge-tree";
/**
 * Used by the DocumentView to concatenate adjacent text segments that share the same style.  These should be
 * rendered using a single <span> element to preserve kerning & ligatures.
 */
export declare class TextAccumulator {
    readonly style: CSSStyleDeclaration;
    readonly segments: TextSegment[];
    readonly startPosition: number;
    private _text;
    private _nextPosition;
    constructor(position: number, first: TextSegment, startOffset: number, relativeEndOffset: number);
    readonly tryConcat: (position: number, segment: ISegment, relativeStartOffset: number, relativeEndOffset: number) => boolean;
    readonly text: string;
    readonly nextPosition: number;
}
//# sourceMappingURL=textaccumulator.d.ts.map