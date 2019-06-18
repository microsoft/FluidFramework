/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { DocSegmentKind, FlowDocument, getDocSegmentKind } from "@chaincode/flow-document";
import { bsearch2, Dom } from "@prague/flow-util";
import {
    TextSegment,
} from "@prague/merge-tree";
import { IFlowViewComponent, View } from "../";
import { debug, nodeAndOffsetToString } from "../../debug";
import { PagePosition } from "../../pagination";
import { InclusionView } from "../inclusion";
import { DocumentLayout } from "./layout";
import { DocumentViewState, IViewInfo, LayoutContext } from "./layoutcontext";
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

// IView that renders a FlowDocument.
export class DocumentView extends View<IDocumentProps, DocumentViewState> {
    public get doc()            { return this.state.doc; }
    public get root()           { return this.state.root; }
    public get overlay()        { return this.state.overlay; }
    public get leadingSpan()    { return template.get(this.root, "leadingSpan"); }
    public get trailingSpan()   { return template.get(this.root, "trailingSpan"); }
    public get paginationStop() { return this.state.end; }

    public get range() {
        const { doc, start, end } = this.state;
        return {
            start: this.getPagePosition(doc, start, 0),
            end: this.getPagePosition(doc, end, +Infinity),
        };
    }

    private get emittedRange() {
        const { emitted } = this.state;
        return emitted.length < 1
            ? { start: +Infinity, end: -Infinity }
            : { start: emitted[0].span.startPosition, end: emitted[emitted.length - 1].span.endPosition };
    }

    private static readonly findBelowPredicate: FindVerticalPredicate =
        (top, bottom, best, candidate) => {
            return candidate.bottom > bottom        // Must be below original bottom
                && candidate.top <= best.top;       // Must higher/closer than best match
        }

    private static readonly findAbovePredicate: FindVerticalPredicate =
        (top, bottom, best, candidate) => {
            return candidate.top < top              // Must be above original top
                && candidate.bottom >= best.bottom; // Must be lower/closer than best match
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
    public readonly findBelow = (start: number, end: number, x: number, top: number, bottom: number) => {
        return this.findVertical(start, end, x, top, bottom, DocumentView.findBelowPredicate);
    }

    /**
     * Returns the closest { segment, offset } below the text cursor occupying the 0-width rect
     * described by x/top/bottom.
     */
    public readonly findAbove = (start: number, end: number, x: number, top: number, bottom: number) => {
        return this.findVertical(start, end, x, top, bottom, DocumentView.findAbovePredicate);
    }

    public getInclusionView(position: number): InclusionView {
        if (position < this.doc.length) {
            const { segment } = this.state.doc.getSegmentAndOffset(position);
            if (getDocSegmentKind(segment) === DocSegmentKind.inclusion) {
                return this.state.segmentToViewInfo.get(segment).view as InclusionView;
            }
        }

        return undefined;
    }

    public nodeOffsetToPosition(node: Node, nodeOffset = 0) {
        if (this.leadingSpan.contains(node)) {
            return this.emittedRange.start;
        }

        if (this.trailingSpan.contains(node)) {
            return this.emittedRange.end;
        }

        const { segment, offset } = this.nodeOffsetToSegmentOffset(node, nodeOffset);
        const max = getDocSegmentKind(segment) === DocSegmentKind.text
            ? segment.cachedLength
            : segment.cachedLength - 1;
        const position = this.state.doc.getPosition(segment) + Math.min(offset, max);

        debug(`nodeOffsetToPosition(${nodeAndOffsetToString(node, nodeOffset)} -> ${position}`);

        return position;
    }

    public positionToNodeOffset(position: number) {
        const viewInfo = this.positionToViewInfo(position);

        // If the position is not currently rendered, return the appropriate leading/trailing span.
        if (!viewInfo) {
            const { start } = this.emittedRange;
            return position < start
                ? { node: this.leadingSpan.firstChild }
                : { node: this.trailingSpan.firstChild };
        }

        const node = viewInfo.view.cursorTarget;
        const { segment } = this.doc.getSegmentAndOffset(position);

        switch (getDocSegmentKind(segment)) {
            case DocSegmentKind.text:
                return {
                    node,
                    nodeOffset: Math.min(
                        position - viewInfo.span.startPosition,
                        node.textContent.length,
                    ),
                };
            default: {
                return { node };
            }
        }
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
                        case DocSegmentKind.inclusion:
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

    // Map a node/nodeOffset to the corresponding segment/segmentOffset that rendered it.
    private nodeOffsetToSegmentOffset(node: Node | null, nodeOffset: number) {
        const state = this.state;
        let viewInfo: IViewInfo<any, IFlowViewComponent<any>> | undefined;
        // tslint:disable-next-line:no-conditional-assignment
        while (node && !(viewInfo = state.elementToViewInfo.get(node as Element))) {
            node = node.parentElement;
        }

        return viewInfo && viewInfo.span.spanOffsetToSegmentOffset(nodeOffset);
    }

    private positionToViewInfo(position: number) {
        const emitted = this.state.emitted;
        const viewInfo = emitted[bsearch2(
            (index) => emitted[index].span.endPosition <= position,
            0,
            emitted.length)];

        if (!viewInfo) {
            debug(`positionToViewInfo(${position}) -> undefined`);
            return undefined;
        }

        debug(`positionToViewInfo(${position}) -> ${viewInfo.view.constructor.name}:${position - viewInfo.span.startPosition}`);
        console.assert(viewInfo.span.startPosition <= position && position <= viewInfo.span.endPosition);
        return viewInfo;
    }

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
        debug(`sync([${start}..${end}))`);

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
        debug(`  syncRange([${start}..${end}))`);

        context.pushLayout(DocumentLayout.instance, NaN, undefined, NaN, NaN);

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

    /**
     * Returns the closest { segment, offset } from the text cursor occupying the 0-width rect
     * described by x/top/bottom.
     */
    private findVertical(start: number, end: number, x: number, top: number, bottom: number, predicate: FindVerticalPredicate) {
        debug(`findVertical(${start}..${end}, ${x}, ${top}-${bottom})`);

        let bestRect = { top: +Infinity, bottom: -Infinity, left: +Infinity, right: -Infinity };
        let bestDx = +Infinity;
        let bestViewInfo: IViewInfo<any, IFlowViewComponent<any>> | undefined;

        this.doc.visitRange((position, segment) => {
            const viewInfo = this.state.segmentToViewInfo.get(segment);
            if (!viewInfo) {
                return true;
            }

            const view = viewInfo.view;
            const node = view.root;
            const rects = node.getClientRects();
            debug(`rects: ${rects.length} for ${getDocSegmentKind(segment)}:'${node.textContent}'`);

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

                debug(`    ==> Best candidate: ${viewInfo.view.root.id}: '${viewInfo.view.root.textContent}' dx=${dx} dyTop=${bestRect.top - rect.top} dyBottom=${bestRect.bottom - rect.bottom}`);
                bestRect = rect;
                bestDx = dx;
                bestViewInfo = viewInfo;
            }

            return true;
        }, start, end);

        if (!bestViewInfo) {
            debug(`No best candidate found.`);
            return undefined;
        }

        debug(`Best candidate: ${bestViewInfo.view.root.id}: ${bestViewInfo.view.root.textContent}`);
        debug(`    rect: ${JSON.stringify(bestRect)}`);

        return getDocSegmentKind(bestViewInfo.span.firstSegment) === DocSegmentKind.text
            ? this.nodeOffsetToSegmentOffset(
                bestViewInfo.view.cursorTarget,
                Dom.findNodeOffset(
                    bestViewInfo.view.cursorTarget,
                    Math.min(Math.max(x, bestRect.left), bestRect.right),
                    bestRect.top, bestRect.bottom))
            : { segment: bestViewInfo.span.firstSegment, offset: 0 };
    }
}
