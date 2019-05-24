import { DocSegmentKind, FlowDocument, getDocSegmentKind, getInclusionHtml, getInclusionKind, InclusionKind, SegmentSpan } from "@chaincode/flow-document";
import { bsearch2, Char, Dom } from "@prague/flow-util";
import {
    ISegment,
    Marker,
    TextSegment,
} from "@prague/merge-tree";
import { IFlowViewComponent, View } from "../";
import { debug } from "../../debug";
import { PagePosition } from "../../pagination";
import { InclusionView } from "../inclusion";
import { LineBreakView } from "../linebreak";
import { ParagraphView } from "../paragraph";
import { TextLayout, TextView } from "../text";
import { DocumentViewState, IViewInfo, LayoutContext } from "./layoutcontext";
import { LayoutSink } from "./layoutsink";
import { template } from "./template";
import { ITrackedPosition } from "./trackedposition";

/**
 * The state to be visualized/edited by the DocumentView.
 */
export interface IDocumentProps {
    doc: FlowDocument;
    trackedPositions: ITrackedPosition[];
    start?: PagePosition;
    paginationBudget?: number;
    onPaginationStop?: (position: PagePosition) => void;
}

interface IRect { top: number; bottom: number; left: number; right: number; }
type FindVerticalPredicate = (top: number, bottom: number, best: IRect, candidate: IRect) => boolean;

const inclusionRootSym = Symbol("Flow.Editor.Marker.InclusionRoot");

class DocumentLayout extends LayoutSink<{}> {
    public onPush(context: LayoutContext, position: number, segment: ISegment, startOffset: number, endOffset: number): {} {
        return {};
    }

    public tryAppend(state: {}, context: LayoutContext, position: number, segment: ISegment, startOffset: number, endOffset: number) {
        const kind = getDocSegmentKind(segment);
        const span = new SegmentSpan(position, segment, startOffset, endOffset);

        switch (kind) {
            case DocSegmentKind.Text:
                context.pushLayout(TextLayout, position, segment, startOffset, endOffset);
                return true;

            case DocSegmentKind.Paragraph:
                this.syncParagraph(context, span);
                return true;

            case DocSegmentKind.LineBreak:
                this.syncLineBreak(context, span);
                return true;

            case DocSegmentKind.Inclusion:
                this.syncInclusion(context, span, segment as Marker);
                return true;

            case DocSegmentKind.EOF:
                this.syncText(context, span, Char.zeroWidthSpace, "");
                return true;

            default:
                throw new Error(`Unknown DocSegmentKind '${kind}'.`);
        }
    }

    public onPop() { /* do nothing */ }

    // Ensures that the paragraph's view is mounted and up to date.
    private syncParagraph(context: LayoutContext, span: SegmentSpan) {
        context.emitNode(span, ParagraphView.factory, {});
    }

    // Ensures that the lineBreak's view is mounted and up to date.
    private syncLineBreak(context: LayoutContext, span: SegmentSpan) {
        context.emitNode(span, LineBreakView.factory, {});
    }

    // Ensures that the text's view is mounted and up to date.
    private syncText(context: LayoutContext, span: SegmentSpan, text: string, classList: string) {
        context.emitNode(span, TextView.factory, { text, classList });
    }

    // Ensures that a foreign inclusion's view is mounted and up to date.
    private syncInclusion(context: LayoutContext, span: SegmentSpan, marker: Marker) {
        let child: HTMLElement;
        const kind = getInclusionKind(marker);

        child = (marker.properties as any)[inclusionRootSym];
        if (!child) {
            switch (kind) {
                case InclusionKind.HTML:
                    child = getInclusionHtml(marker);
                    break;

                case InclusionKind.Component:
                    child = document.createElement("span");
                    context.doc.getInclusionContainerComponent(marker, [["div", Promise.resolve(child)]]);
                    break;

                default:
                    console.assert(kind === InclusionKind.Chaincode);
                    child = document.createElement("span");
                    context.doc.getInclusionComponent(marker, [["div", Promise.resolve(child)]]);
            }
            (marker.properties as any)[inclusionRootSym] = child;
        }

        context.emitNode(span, InclusionView.factory, { child });
    }
}

const documentLayout = new DocumentLayout();

// IView that renders a FlowDocument.
export class DocumentView extends View<IDocumentProps, DocumentViewState> {
    public get root()       { return this.state.root; }
    public get overlay()    { return this.state.overlay; }
    public get paginationStop() { return this.state.end; }

    private static readonly findBelowPredicate: FindVerticalPredicate =
        (top, bottom, best, candidate) => {
            return candidate.top > top              // disqualify rects higher/same original height
                && candidate.top <= best.top;       // disqualify rects lower than best match
        }

    private static readonly findAbovePredicate: FindVerticalPredicate =
        (top, bottom, best, candidate) => {
            return candidate.bottom < bottom        // disqualify rects lower/same as starting point
                && candidate.bottom >= best.bottom; // disqualify rects higher than best match
        }

    public get range() {
        const { doc, start, end } = this.state;
        return {
            start: this.getPagePosition(doc, start, 0),
            end: this.getPagePosition(doc, end, +Infinity),
        };
    }

    // Returns the { segment, offset } currently visible at the given x/y coordinates (if any).
    public hitTest(x: number, y: number) {
        const { offset, offsetNode } = Dom.caretPositionFromPoint(x, y);
        const segmentAndOffset = this.nodeOffsetToSegmentOffset(offsetNode, offset);
        debug(`  (${x},${y}) -> "${offsetNode.textContent}":${offset} -> ${
            segmentAndOffset
                ? `${(segmentAndOffset.segment as TextSegment).text}:${segmentAndOffset.offset}`
                : `undefined`}`);
        return segmentAndOffset;
    }

    /**
     * Returns the closest { segment, offset } below the text cursor occupying the 0-width rect
     * described by x/top/bottom.
     */
    public readonly findBelow = (x: number, top: number, bottom: number) => {
        return this.findVertical(x, top, bottom, DocumentView.findBelowPredicate);
    }

    /**
     * Returns the closest { segment, offset } below the text cursor occupying the 0-width rect
     * described by x/top/bottom.
     */
    public readonly findAbove = (x: number, top: number, bottom: number) => {
        return this.findVertical(x, top, bottom, DocumentView.findAbovePredicate);
    }

    public getInclusionView(position: number): InclusionView {
        const { segment } = this.state.doc.getSegmentAndOffset(position);

        return getDocSegmentKind(segment) === DocSegmentKind.Inclusion
            ? this.state.segmentToViewInfo.get(segment).view as InclusionView
            : undefined;
    }

    public getPosition(node: Node, nodeOffset = 0) {
        const { segment, offset } = this.nodeOffsetToSegmentOffset(node, nodeOffset);
        return this.state.doc.getPosition(segment) + offset;
    }

    protected mounting(props: IDocumentProps) {
        const root = template.clone();

        return this.updating(props, new DocumentViewState(
            props.doc,
            root,
            props.start,
            /* end: */ undefined,
        ));
    }

    protected updating(props: Readonly<IDocumentProps>, state: DocumentViewState) {
        let findPageBreak = (ctx: LayoutContext) => false;

        if (props.paginationBudget !== undefined) {
            const pageLimit = state.root.getBoundingClientRect().top + props.paginationBudget;

            let remainingChars = 5000;

            findPageBreak = (ctx: LayoutContext) => {
                {
                    const viewInfo = ctx.lastEmitted;
                    const seg = viewInfo.span.firstSegment;

                    switch (getDocSegmentKind(seg)) {
                        case DocSegmentKind.Inclusion:
                            remainingChars = 0;
                            break;

                        default:
                            remainingChars -= viewInfo.span.endPosition - viewInfo.span.startPosition;
                    }

                    if (remainingChars > 0) {
                        return false;
                    }

                    // If the paginator says we've exceeded the amount to render, break here.
                    //
                    // Note: There may be yet-to-removed views below the last view inserted, therefore we should
                    //       compare this view's bottom with the page limit rather than us the root's height.
                    const viewBottom = viewInfo.view.root.getBoundingClientRect().bottom;
                    if (viewBottom <= pageLimit) {
                        return false;
                    }

                    debug(`HALT(position:${viewInfo.span.endPosition}): ${viewBottom} > ${pageLimit}`);
                }

                remainingChars = 5000;
                let lastViewInfo: IViewInfo<unknown, IFlowViewComponent<unknown>>;

                for (lastViewInfo of ctx.emitted) {
                    const viewBounds = lastViewInfo.view.root.getBoundingClientRect();
                    if (viewBounds.bottom > pageLimit) {
                        break;
                    }
                }

                const cursorTarget = lastViewInfo.view.cursorTarget;
                const measurementRange = document.createRange();
                measurementRange.setStart(cursorTarget, 0);

                const breakPoint = bsearch2((index) => {
                    measurementRange.setEnd(cursorTarget, index);
                    const rangeBottom = measurementRange.getBoundingClientRect().bottom;
                    const exceeds = rangeBottom <= pageLimit;
                    debug(`  [0..${index}): ${rangeBottom} ${exceeds ? ">=" : "<"} ${pageLimit} '${cursorTarget.textContent.slice(0, index)}'`);
                    return exceeds;
                }, 0, cursorTarget.textContent.length) + lastViewInfo.span.startPosition - 1;

                this.setPaginationStop(props, state, breakPoint);

                debug("breakpoint: %d -> %d", lastViewInfo.span.endPosition, breakPoint);

                return true;
            };
        }

        const start = this.getPagePosition(props.doc, props.start, 0);

        // 1st layout pass trims beginning of DOM and finds page break, but does not trim
        // the end of the DOM.
        this.sync(props, state, start, +Infinity, [], findPageBreak);

        const stop = this.getPagePosition(props.doc, state.end, +Infinity);

        // 2nd layout pass trims end of DOM to page break and reports tracked positions.
        this.sync(props, state, start, stop, props.trackedPositions, () => false);

        return state;
    }

    protected unmounting() { /* do nothing */ }

    private getPagePosition(doc: FlowDocument, position: PagePosition | undefined, defaultValue: number) {
        return position === undefined
            ? defaultValue
            : doc.localRefToPosition(position[0]);
    }

    private setPaginationStop(props: IDocumentProps, state: DocumentViewState, position: number) {
        const { doc, onPaginationStop } = props;

        if (state.end === undefined) {
            state.end = [ doc.addLocalRef(position) ];
        } else {
            const oldRef = state.end[0];
            if (position === doc.localRefToPosition(oldRef)) {
                return;
            }

            doc.removeLocalRef(oldRef);
            state.end = [ doc.addLocalRef(position) ];
        }

        if (onPaginationStop) {
            onPaginationStop(state.end);
        }
    }

    // Runs state machine, starting with the paragraph at 'start'.
    private sync(props: Readonly<IDocumentProps>, state: DocumentViewState, start: number, end: number, trackedPositions: ITrackedPosition[], halt: (context: LayoutContext) => boolean) {
        debug("sync(%d..%d)", start, end);

        // When paginating, DocumentView must be able to measure the screen size of produced DOM nodes
        // to terminate.  When the DOM tree is detached, these measurements will return 0/empty.
        //
        // Rather than defend against this edge case throughout the code, we simply early exit if the
        // DOM tree is detached.
        if (!state.root.isConnected) {
            debug("sync(): Root node is disconnected.");
            return;
        }

        // Remove any viewInfos whose document position is before the current start.
        this.unmountBeforePosition(state, start);

        const context = new LayoutContext(
            props.doc,
            state,
            state.slot,
            trackedPositions,
            halt);

        this.syncRange(context, start, end, halt);

        // Any nodes not re-used from the previous layout are unmounted and removed.
        context.unmount();
    }

    private syncRange(context: LayoutContext, start: number, end: number, halt: (context: LayoutContext) => boolean) {
        debug(`syncRange([${start}..${end})`);

        context.pushLayout(documentLayout, NaN, undefined, NaN, NaN);

        try {
            context.doc.visitRange((position, segment, startOffset, endOffset) => {
                const shouldContinue = context.layout(position, segment, startOffset, endOffset);

                if (!shouldContinue) {
                    debug(`syncRange stopped @ ${position + endOffset}`);
                }

                return shouldContinue;
            }, start, end);
        } finally {
            while (context.popLayout()) { /* do nothing */ }
        }
    }

    private unmountBeforePosition(state: DocumentViewState, start: number) {
        const toRemove: Array<IViewInfo<unknown, IFlowViewComponent<unknown>>> = [];

        for (const info of state.segmentToViewInfo.values()) {
            if (info.span.endPosition < start) {
                toRemove.push(info);
            }
        }

        for (const info of toRemove) {
            this.state.elementToViewInfo.delete(info.view.root);
            this.state.segmentToViewInfo.delete(info.span.firstSegment);
            info.view.unmount();
        }
    }

    // Map a node/nodeOffset to the corresponding segment/segmentOffset that rendered it.
    private nodeOffsetToSegmentOffset(node: Node | null, nodeOffset: number) {
        const state = this.state;
        let viewInfo: IViewInfo<any, IFlowViewComponent<any>> | undefined;
        // tslint:disable-next-line:no-conditional-assignment
        while (node && !(viewInfo = state.elementToViewInfo.get(node as Element))) {
            node = node.parentElement;
        }

        if (!viewInfo) {
            return undefined;
        }

        let segment: ISegment;
        let offset = NaN;

        viewInfo.span.forEach((position, candidate, startOffset, endOffset) => {
            segment = candidate;
            const len = endOffset - startOffset;

            offset = startOffset + nodeOffset;
            if (nodeOffset < len) {
                return false;
            }

            nodeOffset -= len;
            return true;
        });

        return segment && { segment, offset };
    }

    /**
     * Returns the closest { segment, offset } below the text cursor occupying the 0-width rect
     * described by x/top/bottom.
     */
    private findVertical(x: number, top: number, bottom: number, predicate: FindVerticalPredicate) {
        debug(`looking below: ${bottom}`);

        const state = this.state;
        let bestRect = { top: +Infinity, bottom: -Infinity, left: +Infinity, right: -Infinity };
        let bestDx = +Infinity;
        let bestViewInfo: IViewInfo<any, IFlowViewComponent<any>> | undefined;

        for (const viewInfo of state.elementToViewInfo.values()) {
            const segmentKind = getDocSegmentKind(viewInfo.span.firstSegment);
            if (segmentKind !== DocSegmentKind.Text && segmentKind !== DocSegmentKind.Inclusion) {
                continue;
            }

            const view = viewInfo.view;
            const node = view.root;
            const rects = node.getClientRects();
            debug(`rects: ${rects.length} for ${node.textContent}`);

            for (const rect of rects) {
                debug(`    ${JSON.stringify(rect)}`);
                if (!predicate(top, bottom, bestRect, rect)) {
                    continue;
                }

                // Disqualify the new rect if its horizontal distance is greater than the best match
                const dx = Math.max(rect.left - x, 0, x - rect.right);
                if (dx > bestDx) {
                    debug(`        Rejected dx (${dx} > ${bestDx})`);
                    continue;
                }

                bestRect = rect;
                bestDx = dx;
                bestViewInfo = viewInfo;
                debug(`    ==> Best candidate: ${bestViewInfo.view.root.id}: ${bestViewInfo.view.root.textContent}`);
            }
        }

        if (!bestViewInfo) {
            debug(`No best candidate found.`);
            return undefined;
        }

        debug(`Best candidate: ${bestViewInfo.view.root.id}: ${bestViewInfo.view.root.textContent}`);
        debug(`    rect: ${JSON.stringify(bestRect)}`);

        return getDocSegmentKind(bestViewInfo.span.firstSegment) === DocSegmentKind.Text
            ? this.nodeOffsetToSegmentOffset(
                bestViewInfo.view.cursorTarget,
                Dom.findNodeOffset(
                    bestViewInfo.view.cursorTarget,
                    Math.min(Math.max(x, bestRect.left), bestRect.right),
                    bestRect.top, bestRect.bottom))
            : { segment: bestViewInfo.span.firstSegment, offset: 0 };
    }
}
