/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { DocSegmentKind, getDocSegmentKind, SegmentSpan } from "@chaincode/flow-document";
import { ISegment, Marker } from "@prague/merge-tree";
import { TagView } from ".";
import { DocumentLayout } from "../document/layout";
import { LayoutContext } from "../document/layoutcontext";
import { LayoutSink } from "../document/layoutsink";

interface ITagLayoutState { marker: Marker; }

class TagLayoutSink extends LayoutSink<ITagLayoutState> {
    public onPush(context: LayoutContext, position: number, segment: ISegment, startOffset: number, endOffset: number) {
        const marker = segment as Marker;
        const { tag, classList, style } = marker.properties;
        context.pushNode(
            new SegmentSpan(position, segment, startOffset, endOffset),
            TagView.factory,
            { tag, classList, style });

        return { marker };
    }

    public tryAppend(state: ITagLayoutState, context: LayoutContext, position: number, segment: ISegment, startOffset: number, endOffset: number) {
        if (getDocSegmentKind(segment) === DocSegmentKind.endRange) {
            console.assert(segment.properties.tag === state.marker.properties.tag);
            return false;
        }

        return DocumentLayout.instance.tryAppend(undefined, context, position, segment, startOffset, endOffset);
    }

    public onPop(state: ITagLayoutState, context: LayoutContext) {
        context.popNode();
    }
}

export const TagLayout = new TagLayoutSink();
