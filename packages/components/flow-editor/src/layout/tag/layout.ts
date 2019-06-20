/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { DocSegmentKind, getDocSegmentKind, SegmentSpan } from "@chaincode/flow-document";
import { ISegment, Marker } from "@prague/merge-tree";
import { DocumentLayout } from "../document/layout";
import { LayoutContext } from "../document/layoutcontext";
import { LayoutSink } from "../document/layoutsink";
import { TagView } from "../tag";

interface ITagLayoutState { marker: Marker; }

class TagLayoutSink extends LayoutSink<ITagLayoutState> {
    public onPush(context: LayoutContext, position: number, segment: ISegment, startOffset: number, endOffset: number) {
        const { tag, classList, style } = segment.properties;
        context.pushView(
            new SegmentSpan(position, segment, startOffset, endOffset),
            TagView.factory,
            { tag, classList, style });

        return { marker: segment as Marker };
    }

    public tryAppend(state: ITagLayoutState, context: LayoutContext, position: number, segment: ISegment, startOffset: number, endOffset: number) {
        switch (getDocSegmentKind(segment)) {
            case DocSegmentKind.endRange:
                console.assert(segment.properties.tag === state.marker.properties.tag);
                context.popLayout();
                return true;
            case DocSegmentKind.paragraph:
                context.popView();
                const { classList, style } = segment.properties;
                context.pushView(
                    new SegmentSpan(position, segment, startOffset, endOffset),
                    TagView.factory,
                    { tag: state.marker.properties.tag, classList, style });
                return true;
            default:
                return DocumentLayout.instance.tryAppend(undefined, context, position, segment, startOffset, endOffset);
        }
    }

    public onPop(state: ITagLayoutState, context: LayoutContext) {
        context.popView();
    }
}

export const TagLayout = new TagLayoutSink();
