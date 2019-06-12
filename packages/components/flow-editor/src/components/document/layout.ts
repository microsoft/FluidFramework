import {
    DocSegmentKind,
    getDocSegmentKind,
    SegmentSpan,
} from "@chaincode/flow-document";
import { ISegment, Marker } from "@prague/merge-tree";
import { InclusionView } from "../inclusion";
import { LineBreakView } from "../linebreak";
import { ParagraphView } from "../paragraph";
import { TagView } from "../tag";
import { TextLayout } from "../text";
import { LayoutContext } from "./layoutcontext";
import { LayoutSink } from "./layoutsink";

const inclusionRootSym = Symbol("Flow.Editor.Marker.InclusionRoot");

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
                context.emitNode(span, ParagraphView.factory, {});
                return true;

            case DocSegmentKind.lineBreak:
                context.emitNode(span, LineBreakView.factory, {});
                return true;

            case DocSegmentKind.beginTag:
                const { tag, classList, style } = segment.properties;
                context.pushNode(
                    new SegmentSpan(position, segment, startOffset, endOffset),
                    TagView.factory,
                    { tag, classList, style });
                return true;

            case DocSegmentKind.inclusion:
                this.emitInclusion(context, span, segment as Marker);
                return true;

            case DocSegmentKind.endRange:
                context.popNode();
                return true;

            default:
                throw new Error(`Unknown DocSegmentKind '${kind}'.`);
        }
    }

    public onPop() { /* do nothing */ }

    // Ensures that a foreign inclusion's view is mounted and up to date.
    private emitInclusion(context: LayoutContext, span: SegmentSpan, marker: Marker) {
        let child = marker[inclusionRootSym];
        if (!child) {
            // DANGER: Note that Inclusion.caretEnter(..) compensates for the extra <span> required
            //         for the "div" style mounting.
            child = document.createElement("span");
            context.doc.getComponent(marker, [["div", Promise.resolve(child)]]);
            marker[inclusionRootSym] = child;
        }

        context.emitNode(span, InclusionView.factory, { child });
    }
}
