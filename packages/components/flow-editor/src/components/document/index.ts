import { DocSegmentKind, FlowDocument, getDocSegmentKind, getInclusionHtml, getInclusionKind, InclusionKind } from "@chaincode/flow-document";
import { bsearch2, Char, Dom, Template } from "@prague/flow-util";
import {
    ISegment,
    Marker,
    TextSegment,
} from "@prague/merge-tree";
import { IFlowViewComponent, IViewState, View } from "../";
import { debug } from "../../debug";
import { PagePosition } from "../../pagination";
import { InclusionView } from "../inclusion";
import { LineBreakView } from "../linebreak";
import { ParagraphView } from "../paragraph";
import { TextView } from "../text";
import * as styles from "./index.css";
import { SegmentSpan } from "./segmentspan";
import { TextAccumulator } from "./textaccumulator";

const template = new Template({
    tag: "span",
    props: { className: styles.document },
    children: [
        { tag: "span", ref: "leadingSpan", props: { className: styles.leadingSpan }},
        { tag: "span", ref: "slot", props: { className: styles.documentContent }},
        { tag: "span", ref: "trailingSpan", props: { className: styles.trailingSpan }},
        { tag: "span", ref: "overlay", props: { className: styles.documentOverlay }},
    ],
});

type TrackedPositionCallback = (node: Node, nodeOffset: number) => void;

/**
 * A position in the FlowDocument and a callback to be invoked with the DOM node
 * and offset within the dom node where that position is rendered.
 */
export interface ITrackedPosition {
    position: number;
    callback: TrackedPositionCallback;
    sync?: boolean;
}

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

/**
 * The state that is calculated/cached for each segment within the currently rendered
 * window.
 */
export interface IViewInfo<TProps, TView extends IFlowViewComponent<TProps>> {
    view: TView;
    span: SegmentSpan;
}

interface IRect { top: number; bottom: number; left: number; right: number; }
type FindVerticalPredicate = (top: number, bottom: number, best: IRect, candidate: IRect) => boolean;

/**
 * The state maintained by the DocumentView instance.
 */
interface IDocumentViewState extends IViewState {
    doc: FlowDocument;

    // The root element into which segments are rendered.
    slot: HTMLElement;

    // The root element into which overlays are attached.
    overlay: Element;

    /**
     * Mapping from segments to their IViewInfo, if the segment is currently within the rendered window.
     * Note that when a range of segments are rendered by a single view (as is the case with TextSegments
     * that share the same style), only the first segment in the range appears in this map.
     */
    segmentToViewInfo: Map<ISegment, IViewInfo<unknown, IFlowViewComponent<unknown>>>;

    /**
     * Mapping from the root element produced by an IView to it's IViewInfo.
     */
    elementToViewInfo: Map<Element, IViewInfo<unknown, IFlowViewComponent<unknown>>>;

    start?: PagePosition;
    end?: PagePosition;
}

const inclusionRootSym = Symbol("Flow.Editor.Marker.InclusionRoot");

// IView that renders a FlowDocument.
export class DocumentView extends View<IDocumentProps, IDocumentViewState> {
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

    protected mounting(props: IDocumentProps) {
        const root = template.clone();
        const slot = template.get(root, "slot") as HTMLElement;
        const overlay = template.get(root, "overlay");

        return this.updating(props, {
            doc: props.doc,
            root,
            slot,
            overlay,
            segmentToViewInfo: new Map<ISegment, IViewInfo<unknown, IFlowViewComponent<unknown>>>(),
            elementToViewInfo: new Map<Element, IViewInfo<unknown, IFlowViewComponent<unknown>>>(),
            start: props.start,
            end: props.start,
        });
    }

    protected updating(props: Readonly<IDocumentProps>, state: IDocumentViewState) {
        const pageLimit = state.root.getBoundingClientRect().top + props.paginationBudget;

        let remainingChars = 5000;
        const findPageBreak = (ctx: LayoutContext) => {
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

            debug("breakpoint: %d -> %d", lastViewInfo.span.endPosition, breakPoint);

            this.setPaginationStop(props, state, breakPoint);

            return true;
        };

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

    private setPaginationStop(props: IDocumentProps, state: IDocumentViewState, position: number) {
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
    private sync(props: Readonly<IDocumentProps>, state: IDocumentViewState, start: number, end: number, trackedPositions: ITrackedPosition[], halt: (context: LayoutContext) => boolean) {
        debug("sync(%d..%d)", start, end);

        // When paginating, DocumentView must be able to measure the screen size of produced DOM nodes
        // to terminate.  When the DOM tree is detached, these measurements will return 0/empty.
        //
        // Rather than defend against this edge case throughout the code, we simply early exit if the
        // DOM tree is detached.
        if (!state.root.isConnected) {
            return;
        }

        // Remove any viewInfos whose document position is before the current start.
        this.unmountBeforePosition(props, state, start);

        const context = new LayoutContext(
            props.doc,
            state,
            state.slot,
            trackedPositions);

        this.syncRange(props, state, context, start, end, halt);

        // Any nodes not re-used from the previous layout are unmounted and removed.
        context.unmount();
    }

    private syncRange(props: IDocumentProps, state: IDocumentViewState, context: LayoutContext, start: number, end: number, halt: (context: LayoutContext) => boolean) {
        debug(`syncRange([${start}..${end})`);

        do {
            // Ensure that we exit the outer do..while loop if there are no remaining segments.
            let nextStart = -1;

            context.doc.visitRange((position, segment, startOffset, endOffset) => {
                nextStart = this.syncSegment(context, position, segment, startOffset, endOffset);

                // Give the 'halt' callback an opportunity to terminate layout.
                if (halt(context)) {
                    nextStart = -1;
                    return false;
                }

                // If the 'syncSegment' returned '-1', proceed to the next segment (if any).
                // Otherwise break to the outer 'do..while' loop and we'll restart at the returned
                // 'next' position.
                return nextStart < 0;
            }, start, end);

            start = nextStart;
        } while (start >= 0);
    }

    private unmountBeforePosition(props: IDocumentProps, state: IDocumentViewState, start: number) {
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

    private mountView<TProps, TView extends IFlowViewComponent<TProps>>(
        context: LayoutContext,
        span: SegmentSpan,
        factory: () => TView,
        props: TProps,
    ): IViewInfo<TProps, TView> {
        const view = factory();
        view.mount(props);

        return context.setViewInfo({ view, span });
    }

    /**
     * Ensure that the IView for the given set of Segments has been created and that it's root DOM node
     * is at the correct position within the current parent.
     */
    private syncNode<TProps, TView extends IFlowViewComponent<TProps>>(
        context: LayoutContext,
        span: SegmentSpan,
        factory: () => TView,
        props: TProps,
    ): IViewInfo<TProps, TView> {
        const parent = context.root;
        const previous = context.lastEmitted && context.lastEmitted.view.root;

        // TODO: Check all non-head segments to look for best match?
        let viewInfo = context.maybeReuseViewInfo<TProps, TView>(span.firstSegment);
        if (!viewInfo) {
            // Segment was not previously in the rendered window.  Create it.
            viewInfo = this.mountView(context, span, factory, props);

            // Insert the node for the new segment after the previous block.
            Dom.insertAfter(parent, viewInfo.view.root, previous);
        } else {
            viewInfo.span = span;
            const view = viewInfo.view;
            view.update(props);

            const node = viewInfo.view.root;

            // The node was previously inside the rendered window.  See if it is already in the correct location.
            if (!Dom.isAfterNode(parent, node, previous)) {
                // The node is not in the correct position.  Move it.
                //
                // TODO: Sometimes we have a choice if we move the cached node or the one already residing in the
                //       expected position.  We should prefer to move nodes known not to have side effects (i.e.,
                //       do not move inclusion if possible, and never move the node containing focus.)
                Dom.insertAfter(parent, node, previous);
            }
        }

        context.emit(viewInfo);
        context.notifyTrackedPositionListeners(viewInfo.view.cursorTarget, span);

        return viewInfo;
    }

    // Ensures that the paragraph's view is mounted and up to date.
    private syncParagraph(context: LayoutContext, span: SegmentSpan) {
        this.syncNode(context, span, ParagraphView.factory, {});
    }

    // Ensures that the lineBreak's view is mounted and up to date.
    private syncLineBreak(context: LayoutContext, span: SegmentSpan) {
        this.syncNode(context, span, LineBreakView.factory, {});
    }

    // Ensures that the text's view is mounted and up to date.
    private syncText(context: LayoutContext, span: SegmentSpan, text: string) {
        this.syncNode(context, span, TextView.factory, { text });
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

        this.syncNode(context, span, InclusionView.factory, { child });
    }

    private syncSegment(context: LayoutContext, position: number, segment: ISegment, startOffset: number, endOffset: number) {
        const kind = getDocSegmentKind(segment);
        const span = new SegmentSpan();

        if (kind === DocSegmentKind.Text) {
            const accumulator = new TextAccumulator(span);
            context.doc.visitRange(accumulator.tryConcat, Math.max(position + startOffset, position), position + endOffset);
            this.syncText(context, span, accumulator.text);
            return span.endPosition;
        } else {
            span.append(position, segment, startOffset, endOffset);
            switch (kind) {
                case DocSegmentKind.Paragraph:
                    this.syncParagraph(context, span);
                    break;

                case DocSegmentKind.LineBreak:
                    this.syncLineBreak(context, span);
                    break;

                case DocSegmentKind.Inclusion:
                    this.syncInclusion(context, span, segment as Marker);
                    break;

                case DocSegmentKind.EOF:
                    this.syncText(context, span, Char.ZeroWidthSpace);
                    break;

                default:
                    throw new Error(`Unknown DocSegmentKind '${kind}'.`);
            }
        }

        // By default, continue continue with the next segment.
        return -1;
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

    // Returns the closest { segment, offset } to the 0-width rect described by x/top/bottom.
    private findDomPosition(node: Node, x: number, yMin: number, yMax: number) {
        const domRange = document.createRange();
        const nodeOffset = bsearch2((m) => {
            domRange.setStart(node, m);
            domRange.setEnd(node, m);

            // Note: On Safari 12, 'domRange.getBoundingClientRect()' returns an empty rectangle when domRange start === end.
            //       However, 'getClientRects()' for the same range returns the expected 0-width rect.
            const bounds = domRange.getClientRects()[0];
            const cy = (bounds.top + bounds.bottom) / 2;
            return ((cy < yMin)                                // Current position is above our target rect.
                || (cy < yMax && bounds.left < x));            // Current position is within our desired y range.
        }, 0, node.textContent.length);

        return this.nodeOffsetToSegmentOffset(node, nodeOffset);
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
            // TODO: Better filter for potential cursor targets?
            if (!(viewInfo.view instanceof TextView)) {
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

        return this.findDomPosition(
            bestViewInfo.view.cursorTarget,
            Math.min(Math.max(x, bestRect.left), bestRect.right),
            bestRect.top, bestRect.bottom);
    }
}

// Holds ephemeral state used during layout calculations.
class LayoutContext {
    // The next tracked position we're looking for.
    private get nextTrackedPosition() {
        return this.pendingTrackedPositions[this.pendingTrackedPositions.length - 1];
    }

    public get lastEmitted() { return this.emitted[this.emitted.length - 1]; }

    // The IViewInfo for the last rendered inline view.
    // tslint:disable-next-line:variable-name
    public readonly emitted: Array<IViewInfo<unknown, IFlowViewComponent<unknown>>> = [];

    /**
     * Sorted stack of tracked position we're still looking for.  Positions are popped from
     * the stack as the consumers are notified.
     */
    private readonly pendingTrackedPositions: ITrackedPosition[];

    private readonly pendingNotifications = [];

    /**
     * Set of Elements that were previously rendered that have not yet been encountered by
     * this layout pass.  At the end of the layout pass, any remaining elements are unmounted
     * as they are no longer within the rendered window.
     */
    private readonly pendingLayout: Set<Element>;

    constructor(readonly doc: FlowDocument, readonly state: IDocumentViewState, public root: Element, trackedPositions: ITrackedPosition[]) {
        // Initialize 'pendingTrackedPositions' by copying and sorting the tracked positions.
        this.pendingTrackedPositions = trackedPositions
            .slice(0)
            .sort((left, right) => right.position - left.position);

        // Initialize 'pendingLayout' with the set of root elements rendered in the last layout pass.
        this.pendingLayout = new Set<Element>(state.elementToViewInfo.keys());
    }

    /**
     * Invoked for each DOM node we emit.  Position is the starting position rendered by the current IView.
     */
    public notifyTrackedPositionListeners(node: Node, span: SegmentSpan) {
        const { startPosition, endPosition } = span;

        // Notify listeners if any of the consumed segments intersected a tracked position.
        this.queueNotifications(node, startPosition, endPosition);
    }

    // Invoked at completion of the layout pass to unmount all IViews that are no longer in the rendered window.
    public unmount() {
        for (const toUnmount of this.pendingLayout) {
            const toUnmountInfo = this.elementToViewInfo(toUnmount)!;
            this.state.elementToViewInfo.delete(toUnmount);
            toUnmountInfo.view.unmount();
        }

        this.pendingLayout.clear();

        // Rebuild the segment -> ViewInfo map from the remaining visible elements.
        this.state.segmentToViewInfo = new Map<ISegment, IViewInfo<unknown, IFlowViewComponent<unknown>>>(
            [...this.state.elementToViewInfo.values()].map<[ISegment, IViewInfo<any, IFlowViewComponent<any>>]>(
                (viewInfo) => [viewInfo.span.firstSegment, viewInfo]));

        // Dispatch pending notifications for positions we passed during our layout.
        for (const { node, nodeOffset, callback } of this.pendingNotifications) {
            callback(node, nodeOffset);
        }

        // Notify listeners whose tracked positions were after our rendered window.
        {
            const lastNode = template.get(this.state.root, "trailingSpan");
            const trackedPositions = this.pendingTrackedPositions;

            for (let i = trackedPositions.length - 1; i >= 0; i--) {
                trackedPositions[i].callback(lastNode, +Infinity);
            }
        }
    }

    public elementToViewInfo(element: Element) { return this.state.elementToViewInfo.get(element); }

    /**
     * If the given 'segment' is at the head of a list of previously rendered segments, return it's
     * cached ViewInfo and remove that IView from the pendingLayout list.
     */
    public maybeReuseViewInfo<TProps, TView extends IFlowViewComponent<TProps>>(segment: ISegment) {
        const viewInfo = this.state.segmentToViewInfo.get(segment);
        if (viewInfo) {
            this.pendingLayout.delete(viewInfo.view.root);
        }
        return viewInfo as IViewInfo<TProps, TView>;
    }

    public emit<TProps>(viewInfo: IViewInfo<TProps, IFlowViewComponent<TProps>>) {
        this.emitted.push(viewInfo);
    }

    public setViewInfo<TProps, TView extends IFlowViewComponent<TProps>>(viewInfo: IViewInfo<TProps, TView>) {
        this.state.segmentToViewInfo.set(viewInfo.span.firstSegment, viewInfo);
        this.state.elementToViewInfo.set(viewInfo.view.root, viewInfo);
        return viewInfo;
    }

    /**
     * Invoked for each DOM node we emit.  Position is the starting position rendered by the current IView.
     */
    private queueNotifications(node: Node, position: number, end: number) {
        const trackedPositions = this.pendingTrackedPositions;
        let topTracked: ITrackedPosition;

        // Notify listeners if any of the consumed segments intersected a tracked position.
        // tslint:disable-next-line:no-conditional-assignment
        while ((topTracked = this.nextTrackedPosition) && topTracked.position < end) {
            const callback = topTracked.callback;
            const nodeOffset = topTracked.position - position;

            debug("Tracked position @%d -> '%s':%d", topTracked.position, node.textContent, nodeOffset);
            console.assert(nodeOffset < node.textContent.length);

            if (topTracked.sync) {
                callback(node, nodeOffset);
            } else {
                this.pendingNotifications.push({ callback, node, nodeOffset });
            }

            trackedPositions.pop();
        }
    }
}
