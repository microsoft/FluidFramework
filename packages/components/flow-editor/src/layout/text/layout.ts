/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { getCssClassList, SegmentSpan } from "@chaincode/flow-document";
import { ISegment, TextSegment } from "@prague/merge-tree";
import { LayoutContext } from "../document/layoutcontext";
import { LayoutSink } from "../document/layoutsink";
import { TextView } from "../text";

interface ITextLayoutState {
    span: SegmentSpan;
    classList: string;
}

class TextLayoutSink extends LayoutSink<ITextLayoutState> {
    public onPush(context: LayoutContext, position: number, segment: ISegment, startOffset: number, endOffset: number) {
        return {
            span: new SegmentSpan(position, segment, startOffset, endOffset),
            classList: getCssClassList(segment),
        };
    }

    public tryAppend({ span, classList }: ITextLayoutState, context: LayoutContext, position: number, segment: ISegment, startOffset: number, endOffset: number) {
        // Terminate if the next segment is not a text segment.
        if (TextSegment.is(segment) && classList === getCssClassList(segment)) {
            span.append(position, segment, startOffset, endOffset);
            return true;
        }

        return false;
    }

    public onPop({ span, classList }: ITextLayoutState, context: LayoutContext) {
        const text = span.segments.join("").substr(span.startOffset, span.endPosition - span.startPosition);
        context.emitView(span, TextView.factory, { text, classList });
    }
}

export const TextLayout = new TextLayoutSink();
