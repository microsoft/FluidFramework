import {
    Segment,
    Marker,
    TextSegment,
} from "@prague/merge-tree";
import { Template, Dom } from "@prague/flow-util";
import { getInclusionKind, getInclusionHtml, getInclusionComponent, FlowDocument, DocSegmentKind, getDocSegmentKind, InclusionKind } from "@chaincode/flow-document";
import { ParagraphView } from "../paragraph";
import { LineBreakView } from "../linebreak";
import { TextView } from "../text";
import { IFlowViewComponent, IViewState, View } from "../";
import { InclusionView } from "../inclusion";
import { TextAccumulator } from "./textaccumulator";
import * as styles from "./index.css";

const template = new Template({
    tag: "span",
    props: { className: styles.document, },
    children: [
        {
            tag: "span",
            ref: "eventsink",
            props: { tabIndex: 0 },
            children: [
                { tag: "span", ref: "leadingSpan", props: { className: styles.leadingSpan }},
                { tag: "span", ref: "slot", props: { className: styles.documentContent }},
                { tag: "span", ref: "trailingSpan", props: { className: styles.trailingSpan }},
                { tag: "span", ref: "overlay", props: { className: styles.documentOverlay }}
            ]
        }
    ]
});

/**
 * A position in the FlowDocument and a callback to be invoked with the DOM node
 * and offset within the dom node where that position is rendered.
 */
export interface ITrackedPosition {
    position: number, 
    callback: (node: Node, nodeOffset: number) => void
};

/**
 * The state to be visualized/edited by the DocumentView.
 */
export interface IDocumentProps {
    doc: FlowDocument;
    trackedPositions: ITrackedPosition[];
    start: number;
}

/**
 * The state that is calculated/cached for each segment within the currently rendered
 * window.
 */
export interface IViewInfo<TProps, TView extends IFlowViewComponent<TProps>> {
    /** 
     * The document-ordered list of segments visualized by the cached 'view' instance.
     * (Currently, only TextSegments are combined into a single view/element.  Other segment
     * types are 1:1.)
     */
    segments: Segment[];

    /** The IView instance that rendered this set of segments. */
    view: TView;

    /** Cached ClientRects that bound this view. */
    clientRects?: ClientRectList | DOMRectList;
}

/**
 * The state maintained by the DocumentView instance.
 */
interface IDocumentViewState extends IViewState {
    /** The root element into which segments are rendered. */
    slot: HTMLElement,

    /** The root element into which overlays are attached. */
    overlay: Element,

    /** The element to which event handlers are to be attached. */
    eventsink: HTMLElement;

    /** Leading span */
    leadingSpan: Element,
    trailingSpan: Element,

    /** 
     * Mapping from segments to their IViewInfo, if the segment is currently within the rendered window.
     * Note that when a range of segments are rendered by a single view (as is the case with TextSegments
     * that share the same style), only the first segment in the range appears in this map.
     */
    segmentToViewInfo: Map<Segment, IViewInfo<any, IFlowViewComponent<any>>>;

    /**
     * Mapping from the root element produced by an IView to it's IViewInfo.
     */
    elementToViewInfo: Map<Element, IViewInfo<any, IFlowViewComponent<any>>>;
}

/** IView that renders a FlowDocument. */
export class DocumentView extends View<IDocumentProps, IDocumentViewState> {
    protected mounting(props: IDocumentProps) {
        const root = template.clone();
        const eventsink = template.get(root, "eventsink") as HTMLElement;
        const leadingSpan = template.get(root, "leadingSpan");
        const slot = template.get(root, "slot") as HTMLElement;
        const overlay = template.get(root, "overlay");
        const trailingSpan = template.get(root, "trailingSpan");

        return this.updating(props, {
            root,
            slot,
            leadingSpan,
            trailingSpan,
            eventsink,
            overlay,
            segmentToViewInfo: new Map<Segment, IViewInfo<any, IFlowViewComponent<any>>>(),
            elementToViewInfo: new Map<Element, IViewInfo<any, IFlowViewComponent<any>>>()
        });
    }

    public get root()       { return this.state.root; }
    public get slot()       { return this.state.slot; }
    public get overlay()    { return this.state.overlay; }
    public get eventsink()  { return this.state.eventsink; }

    protected updating(props: Readonly<IDocumentProps>, state: Readonly<IDocumentViewState>) {
        DocumentLayout.sync(props, state);
        return state;
    }

    protected unmounting() { }

    /** Map a node/nodeOffset to the corresponding segment/segmentOffset that rendered it. */
    private nodeOffsetToSegmentOffset(node: Node | null, nodeOffset: number) {
        const state = this.state;
        let viewInfo: IViewInfo<any, IFlowViewComponent<any>> | undefined;
        while (node && !(viewInfo = state.elementToViewInfo.get(node as Element))) {
            node = node.parentElement;
        }

        if (!viewInfo) {
            return undefined;
        }

        let segment: Segment | undefined = undefined;
        for (segment of viewInfo.segments) {
            if (nodeOffset < segment.cachedLength) {
                return { segment, offset: nodeOffset };
            }
            nodeOffset -= segment.cachedLength;
        }

        return segment && { segment, offset: segment.cachedLength };
    }

    /** Returns the { segment, offset } currently visible at the given x/y coordinates (if any). */
    public hitTest(x: number, y: number) {
        const range = document.caretRangeFromPoint(x, y);
        const segmentAndOffset = this.nodeOffsetToSegmentOffset(range.startContainer, range.startOffset);
        console.log(`  (${x},${y}) -> "${range.startContainer.textContent}":${range.startOffset} -> ${
            segmentAndOffset
                ? `${(segmentAndOffset.segment as TextSegment).text}:${segmentAndOffset.offset}`
                : `undefined`}`);
        return segmentAndOffset;
    }
 
    /** Returns the closest { segment, offset } to the 0-width rect described by x/top/bottom. */
    private findDomPosition(node: Node, x: number, yMin: number, yMax: number) {
        // Note: Caller must pass a 'node' that was previously rendered for a TextSegment.
        const domRange = document.createRange();
        let left = 0
        let right = node.textContent!.length;

        while (left < right) {
            const m = (left + right) >>> 1;
            domRange.setStart(node, m);
            domRange.setEnd(node, m);

            // Note: On Safari 12, 'domRange.getBoundingClientRect()' returns an empty rectangle when domRange start === end.
            //       However, 'getClientRects()' for the same range returns the expected 0-width rect.
            const bounds = domRange.getClientRects()[0];
            const cy = (bounds.top + bounds.bottom) / 2;
            if ((cy < yMin)                                     // Current position is above our target rect.
                || (cy < yMax && bounds.left < x)) {            // Current position is within our desired y range.
                left = m + 1;
            } else {
                right = m;
            }
        }

        return this.nodeOffsetToSegmentOffset(node, left);
    }

    /** Get the ClientRects that define the boundary of the given 'element', using cached information if we have it. */
    private getClientRects(element: Element) {
        // Note: Caller must only request clientRects for elements we've previously rendered.
        const state = this.state;
        const viewInfo = state.elementToViewInfo.get(element)!;
        if (!viewInfo.clientRects) {
            viewInfo.clientRects = element.getClientRects();
        }
        return viewInfo.clientRects;
    }

    /**
     * Returns the closest { segment, offset } below the text cursor occupying the 0-width rect
     * described by x/top/bottom.
     */
    public findBelow(x: number, top: number, bottom: number) {
        console.log(`looking below: ${bottom}`);

        const state = this.state;
        let bestRect = { top: +Infinity, bottom: -Infinity, left: +Infinity, right: -Infinity };
        let bestDx = +Infinity;
        let bestViewInfo: IViewInfo<any, IFlowViewComponent<any>> | undefined = undefined;

        for (const viewInfo of state.elementToViewInfo.values()) {
            // TODO: Better filter for potential cursor targets?
            if (!(viewInfo.view instanceof TextView)) {
                continue;
            }

            const view = viewInfo.view;
            const node = view.root;
            const rects = this.getClientRects(node);
            console.log(`rects: ${rects.length} for ${node.textContent}`);
            
            for (const rect of rects) {
                console.log(`    ${JSON.stringify(rect)}`);
                // Disqualify any rects at the same height, otherwise our algorithm will select the
                // the current position.
                if (rect.top <= top) {
                    console.log(`        Rejected top: (${rect.top} <= ${top})`)
                    continue;
                }

                // Disqualify any rects lower than our best match.
                if (rect.top > bestRect.top) {
                    console.log(`        Rejected dY: (${rect.top} > ${bestRect.top})`);
                    continue;
                }

                // Accept the new candidate if it is higher than the previous best, or if it's the same
                // height and closer on the x-axis.
                const dx = Math.max(rect.left - x, 0, x - rect.right);
                if (rect.top < bestRect.top || dx < bestDx) {
                    bestRect = rect;
                    bestDx = dx;
                    bestViewInfo = viewInfo;
                    console.log(`    ==> Best candidate: ${bestViewInfo.view.root.id}: ${bestViewInfo.view.root.textContent}`);
                } else {
                    console.log(`        Rejected d^2: (${dx} > ${bestDx})`);
                }
            }
        }

        // Note: Attempting to hit test using 'caretRangeFromPoint()' against the reported client rect's top/bottom
        //       produced inconsistent results, presumably due to internal fixed-point -> Float32 rounding discrepancies.
        // 
        // Reported edge: 487.99713134765625
        //
        // Boundary case: 487.999999999999971578290569595992 (miss)
        //                487.999999999999971578290569595993 (hit)

        if (!bestViewInfo) {
            console.log(`No best candidate found.`);
            return undefined;
        }
        
        console.log(`Best candidate: ${bestViewInfo.view.root.id}: ${bestViewInfo.view.root.textContent}`);
        console.log(`    rect: ${JSON.stringify(bestRect)}`);

        return this.findDomPosition(
            LayoutContext.getCursorTarget(bestViewInfo.view),
            Math.min(Math.max(x, bestRect.left), bestRect.right),
            bestRect.top, bestRect.bottom);    
    }
}

/** Holds ephemeral state used during layout calculations. */
class LayoutContext {
    /** 
     * Sorted stack of tracked position we're still looking for.  Positions are popped from
     * the stack as the consumers are notified.
     */
    private readonly pendingTrackedPositions: ITrackedPosition[];

    /** 
     * Set of Elements that were previously rendered that have not yet been encountered by
     * this layout pass.  At the end of the layout pass, any remaining elements are unmounted
     * as they are no longer within the rendered window.
     */
    private readonly pendingLayout: Set<Element>;

    /** The IViewInfo for the last rendered inline view. */
    private _currentInline: IViewInfo<any, IFlowViewComponent<any>> | null = null;

    constructor (readonly props: IDocumentProps, readonly state: IDocumentViewState, public root: Element) {
        // Initialize 'pendingTrackedPositions' by copying and sorting the tracked positions.
        this.pendingTrackedPositions = props.trackedPositions
            .slice(0)
            .sort((left, right) => right.position - left.position);
        
        // Initialize 'pendingLayout' with the set of root elements rendered in the last layout pass.
        this.pendingLayout = new Set<Element>(state.elementToViewInfo.keys());
    }

    /** 
     * Returns the given view's designated cursor target, if any.  This is the node within the view that
     * should receive the text caret.
     */
    public static getCursorTarget<TProps>(view: IFlowViewComponent<TProps>): Node {
        return (view as any)["cursorTarget"];
    }

    /** The next tracked position we're looking for. */
    private get nextTrackedPosition() {
        return this.pendingTrackedPositions[this.pendingTrackedPositions.length - 1];
    }

    /** 
     * Invoked for each DOM node we emit.  Position is the starting position rendered by the current IView.
     */
    public notifyTrackedPositionListeners(node: Node, position: number, segments: { cachedLength: number }[]) {
        const trackedPositions = this.pendingTrackedPositions;
        let topTracked: ITrackedPosition;

        // Notify listeners if we've advanced past a tracked position without intersecting it (e.g., the
        // tracked position is above the rendered window.)  In this case, the calculated position will be
        // negative.
        while ((topTracked = this.nextTrackedPosition) && topTracked.position < position) {
            trackedPositions.pop()!.callback(node, topTracked.position - position);
        }

        // Notify listeners if any of the consumed segments intersected a tracked position.
        let end = position;
        for (const segment of segments) {
            end += segment.cachedLength;
            while ((topTracked = this.nextTrackedPosition) && position <= topTracked.position && topTracked.position < end) {
                // Note: Pop() cannot return 'undefined' per the condition 'topTracked !== undefined' above.
                trackedPositions.pop()!.callback(node, topTracked.position - position);
            }
        }
    }

    /** Invoked at completion of the layout pass to unmount all IViews that are no longer in the rendered window. */
    public unmount() {
        for (const toUnmount of this.pendingLayout) {
            const toUnmountInfo = this.elementToViewInfo(toUnmount)!;
            this.state.elementToViewInfo.delete(toUnmount);
            toUnmount.remove();
            toUnmountInfo.view.unmount();
        }
        
        this.pendingLayout.clear();

        // Rebuild the segment -> ViewInfo map from the remaining visible elements.
        this.state.segmentToViewInfo = new Map<Segment, IViewInfo<any, IFlowViewComponent<any>>>(
            [...this.state.elementToViewInfo.values()].map<[Segment, IViewInfo<any, IFlowViewComponent<any>>]>(
                viewInfo => [viewInfo.segments[0], viewInfo]));
    }

    public elementToViewInfo(element: Element) { return this.state.elementToViewInfo.get(element); }

    /** 
     * If the given 'segment' is at the head of a list of previously rendered segments, return it's
     * cached ViewInfo and remove that IView from the pendingLayout list.
     */
    public maybeReuseViewInfo<TProps, TView extends IFlowViewComponent<TProps>>(segment: Segment) {
        const viewInfo = this.state.segmentToViewInfo.get(segment);
        if (viewInfo) {
            this.pendingLayout.delete(viewInfo.view.root);
        }
        return viewInfo as IViewInfo<TProps, TView>;
    }

    public setCurrentInline<TProps>(viewInfo: IViewInfo<TProps, IFlowViewComponent<TProps>>) {
        this._currentInline = viewInfo;
        return viewInfo;
    }

    public get currentInline() { return this._currentInline; }

    public setViewInfo<TProps, TView extends IFlowViewComponent<TProps>>(viewInfo: IViewInfo<TProps, TView>) {
        this.state.segmentToViewInfo.set(viewInfo.segments[0], viewInfo);
        this.state.elementToViewInfo.set(viewInfo.view.root, viewInfo);
        return viewInfo;
    }
}

/** State machine that synchronizes the DOM with the visible portion of the FlowDocument. */
export class DocumentLayout {
    private static mountView<TProps, TView extends IFlowViewComponent<TProps>>(
        context: LayoutContext,
        segments: Segment[],
        factory: () => TView,
        props: TProps): IViewInfo<TProps, TView>
    {
        const view = factory();
        view.mount(props);

        return context.setViewInfo({
            view,
            segments
        });
    }

    /** 
     * Ensure that the IView for the given set of Segments has been created and that it's root DOM node
     * is at the correct position within the current parent.
     */
    private static syncNode<TProps, TView extends IFlowViewComponent<TProps>>(
        context: LayoutContext,
        previous: Node | null,
        segments: Segment[],
        factory: () => TView,
        props: TProps): IViewInfo<TProps, TView>
    {
        const parent = context.root;

        // TODO: Check all non-head segments to look for best match?
        let viewInfo = context.maybeReuseViewInfo<TProps, TView>(segments[0]);
        if (!viewInfo) {
            // Segment was not previously in the rendered window.  Create it.
            viewInfo = this.mountView(context, segments, factory, props);

            // Insert the node for the new segment after the previous block.
            Dom.insertAfter(parent, viewInfo.view.root, previous);
        } else {
            viewInfo.segments = segments;
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

            // Client bounds have possibly changed.  Clear cached client rects (if any).
            viewInfo.clientRects = undefined;
        }

        return viewInfo;
    }

    /** Ensures that the given inline 'view' is mounted and up to date. */
    private static syncInline<TProps, TView extends IFlowViewComponent<TProps>>(context: LayoutContext, position: number, segments: Segment[], factory: () => TView, props: TProps) {
        const viewInfo = context.setCurrentInline(
            this.syncNode<TProps, TView>(
                context,
                context.currentInline && context.currentInline.view.root!,
                segments,
                factory,
                props));

        const maybeCursorTarget = LayoutContext.getCursorTarget(viewInfo.view);
        context.notifyTrackedPositionListeners(maybeCursorTarget || viewInfo.view.root, position, segments);
    }

    /** Ensures that the paragraph's view is mounted and up to date. */
    private static syncParagraph(context: LayoutContext, position: number, marker: Marker) {
        this.syncInline(context, position, [ marker ], ParagraphView.factory, {});
    }

    /** Ensures that the lineBreak's view is mounted and up to date. */
    private static syncLineBreak(context: LayoutContext, position: number, marker: Marker) {
        this.syncInline(context, position, [ marker ], LineBreakView.factory, {});
    }

    /** Ensures that the text's view is mounted and up to date. */
    private static syncText(context: LayoutContext, position: number, segments: Segment[], text: string) {
       this.syncInline(context, position, segments, TextView.factory, { text });
    }

    private static readonly inclusionRootSym = Symbol("Flow.Editor.Marker.InclusionRoot");

    /** Ensures that a foreign inclusion's view is mounted and up to date. */
    private static syncInclusion(context: LayoutContext, position: number, marker: Marker) {
        let child: HTMLElement;
        const kind = getInclusionKind(marker);

        child = (marker.properties as any)[this.inclusionRootSym];
        if (!child) {
            switch (kind) {
                case InclusionKind.HTML:
                    child = getInclusionHtml(marker);
                    break;
                
                default:
                    console.assert(kind === InclusionKind.Chaincode);
                    child = document.createElement("span");
                    getInclusionComponent(marker, [["div", Promise.resolve(child)]]);
                    break;
            }
            (marker.properties as any)[this.inclusionRootSym] = child;
        }

        this.syncInline(context, position, [ marker ], InclusionView.factory, { child });
    }

    /** 
     * Finds the largest contiguous run of TextSegments that share the same style as 'first', starting at
     * the given 'start' position and returns the concatenated text.
     */
    private static concatTextSegments(context: LayoutContext, position: number, first: TextSegment, relativeStartOffset: number, relativeEndOffset: number)
        : { text: string, style: CSSStyleDeclaration, segments: TextSegment[], nextPosition: number, startPosition: number }
    {
        const accumulator = new TextAccumulator(position, first, relativeStartOffset, relativeEndOffset);
        context.props.doc.visitRange(accumulator.tryConcat, accumulator.nextPosition, position + relativeEndOffset);
        return accumulator;
    }

    private static syncSegment(context: LayoutContext, position: number, segment: Segment, start: number, end: number) {
        const kind = getDocSegmentKind(segment);
        switch (kind) {
            case DocSegmentKind.Text:
                const textInfo = this.concatTextSegments(context, position, segment as TextSegment, start, end);
                this.syncText(context, textInfo.startPosition, textInfo.segments, textInfo.text);

                // Note: We early exit here with the 'end' of the concatenated range of TextSegments.
                //       This will cause the outer loop to skip to the next TextSegment we haven't yet
                //       processed.  (TODO: Consider pushing/popping processors in the outer loop instead?)
                return textInfo.nextPosition;
            
            case DocSegmentKind.Paragraph:
                this.syncParagraph(context, position, segment as Marker);
                break;

            case DocSegmentKind.LineBreak:
                this.syncLineBreak(context, position, segment as Marker);
                break;

            case DocSegmentKind.Inclusion:
                this.syncInclusion(context, position, segment as Marker);
                break;
          
            case DocSegmentKind.EOF:
                this.syncText(context, position, [segment], "\u200B");
                break;
          
            default:
                throw new Error(`Unknown DocSegmentKind '${kind}'.`);
        }

        // By default, continue continue with the next segment.
        return -1;
    }

    /** Runs state machine, starting with the paragraph at 'start'. */
    public static sync(props: IDocumentProps, state: IDocumentViewState) {
        console.log(`Sync: [${props.start}..?)`);

        const context = new LayoutContext(props, state, state.slot);
        
        let start = props.start;
        do {
            // Ensure that we exit the outer do..while loop if there are no remaining segments.
            let nextStart = -1;
            
            context.props.doc.visitRange((position, segment, startOffset, endOffset) => {
                nextStart = this.syncSegment(context, position, segment, startOffset, endOffset);

                // TODO: Halt synchronization once we're off-screen.

                // If the 'syncSegment' returned '-1', proceed to the next segment (if any).
                // Otherwise break to the outer 'do..while' loop and we'll restart at the returned
                // 'next' position.
                return nextStart < 0;
            }, start);

            start = nextStart;
        } while (start >= 0);

        // Notify listeners whose tracked positions were after our rendered window.
        context.notifyTrackedPositionListeners(LayoutContext.getCursorTarget(context.currentInline!.view)!, +Infinity, []);

        // Any nodes not re-used from the previous layout are unmounted and removed.
        context.unmount();
    }
}