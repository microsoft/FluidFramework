/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    DocSegmentKind,
    getDocSegmentKind,
    SegmentSpan,
} from "@chaincode/flow-document";
import { ISegment, Marker } from "@prague/merge-tree";
import { InclusionView } from "../inclusion";
import { LineBreakView } from "../linebreak";
import { ParagraphView } from "../paragraph";
import { TagLayout } from "../tag/layout";
import { TextLayout } from "../text";
import { LayoutContext } from "./layoutcontext";
import { LayoutSink } from "./layoutsink";

export class DocumentLayout extends LayoutSink<undefined> {
    public static readonly instance = new DocumentLayout();

    public onPush(context: LayoutContext, position: number, segment: ISegment, startOffset: number, endOffset: number) {
        return undefined;
    }

    public tryAppend(state: undefined, context: LayoutContext, position: number, segment: ISegment, startOffset: number, endOffset: number) {
        const kind = getDocSegmentKind(segment);
        const span = new SegmentSpan(position, segment, startOffset, endOffset);

        switch (kind) {
            case DocSegmentKind.text:
                context.pushLayout(TextLayout, position, segment, startOffset, endOffset);
                return true;

            case DocSegmentKind.paragraph:
                context.emitView(span, ParagraphView.factory, {});
                return true;

            case DocSegmentKind.lineBreak:
                context.emitView(span, LineBreakView.factory, {});
                return true;

            case DocSegmentKind.beginTag:
                context.pushLayout(TagLayout, position, segment, startOffset, endOffset);
                return true;

            case DocSegmentKind.inclusion:
                context.emitView(span, InclusionView.factory, { marker: segment as Marker, doc: context.doc });
                return true;

            case DocSegmentKind.endRange:
                context.popView();
                return true;

            default:
                throw new Error(`Unknown DocSegmentKind '${kind}'.`);
        }
    }

    public onPop() { /* do nothing */ }
}
