import { DocSegmentKind, getDocSegmentKind, getInclusionHtml, getInclusionKind, InclusionKind } from "@chaincode/flow-document";
import { Dom, Template } from "@prague/flow-util";
import { View } from "../";
import { debug } from "../../debug";
import { InclusionView } from "../inclusion";
import { LineBreakView } from "../linebreak";
import { ParagraphView } from "../paragraph";
import { TextView } from "../text";
import * as styles from "./index.css";
import { TextAccumulator } from "./textaccumulator";
const template = new Template({
    tag: "span",
    props: { tabIndex: 0, className: styles.document },
    children: [
        { tag: "span", ref: "leadingSpan", props: { className: styles.leadingSpan } },
        { tag: "span", ref: "slot", props: { className: styles.documentContent } },
        { tag: "span", ref: "trailingSpan", props: { className: styles.trailingSpan } },
        { tag: "span", ref: "overlay", props: { className: styles.documentOverlay } },
    ],
});
// IView that renders a FlowDocument.
export class DocumentView extends View {
    constructor() {
        super(...arguments);
        /**
         * Returns the closest { segment, offset } below the text cursor occupying the 0-width rect
         * described by x/top/bottom.
         */
        this.findBelow = (x, top, bottom) => {
            return this.findVertical(x, top, bottom, DocumentView.findBelowPredicate);
        };
        /**
         * Returns the closest { segment, offset } below the text cursor occupying the 0-width rect
         * described by x/top/bottom.
         */
        this.findAbove = (x, top, bottom) => {
            return this.findVertical(x, top, bottom, DocumentView.findAbovePredicate);
        };
    }
    get root() { return this.state.root; }
    get overlay() { return this.state.overlay; }
    // Returns the { segment, offset } currently visible at the given x/y coordinates (if any).
    hitTest(x, y) {
        const range = document.caretRangeFromPoint(x, y);
        const segmentAndOffset = this.nodeOffsetToSegmentOffset(range.startContainer, range.startOffset);
        debug(`  (${x},${y}) -> "${range.startContainer.textContent}":${range.startOffset} -> ${segmentAndOffset
            ? `${segmentAndOffset.segment.text}:${segmentAndOffset.offset}`
            : `undefined`}`);
        return segmentAndOffset;
    }
    mounting(props) {
        const root = template.clone();
        const leadingSpan = template.get(root, "leadingSpan");
        const slot = template.get(root, "slot");
        const overlay = template.get(root, "overlay");
        const trailingSpan = template.get(root, "trailingSpan");
        return this.updating(props, {
            root,
            slot,
            leadingSpan,
            trailingSpan,
            overlay,
            segmentToViewInfo: new Map(),
            elementToViewInfo: new Map(),
        });
    }
    updating(props, state) {
        const originalTrackedPositions = props.trackedPositions;
        const trackedPositions = originalTrackedPositions.slice(0).concat((props.paginator && props.paginator.trackedPositions) || []);
        Object.assign(props, { trackedPositions: [] });
        DocumentLayout.sync(props, state);
        // 2nd pass does not mutate DOM.
        Object.assign(props, { trackedPositions });
        DocumentLayout.sync(props, state);
        Object.assign(props, { trackedPositions: originalTrackedPositions });
        return state;
    }
    unmounting() { }
    // Map a node/nodeOffset to the corresponding segment/segmentOffset that rendered it.
    nodeOffsetToSegmentOffset(node, nodeOffset) {
        const state = this.state;
        let viewInfo;
        // tslint:disable-next-line:no-conditional-assignment
        while (node && !(viewInfo = state.elementToViewInfo.get(node))) {
            node = node.parentElement;
        }
        if (!viewInfo) {
            return undefined;
        }
        let segment;
        for (segment of viewInfo.segments) {
            if (nodeOffset < segment.cachedLength) {
                return { segment, offset: nodeOffset };
            }
            nodeOffset -= segment.cachedLength;
        }
        return segment && { segment, offset: segment.cachedLength };
    }
    // Returns the closest { segment, offset } to the 0-width rect described by x/top/bottom.
    findDomPosition(node, x, yMin, yMax) {
        // Note: Attempting to hit test using 'caretRangeFromPoint()' against a reported client rect's top/bottom
        //       produced inconsistent results, presumably due to internal fixed-point -> Float32 rounding discrepancies.
        //
        // Reported edge: 487.99713134765625
        //
        // Boundary case: 487.999999999999971578290569595992 (miss)
        //                487.999999999999971578290569595993 (hit)
        // Note: Caller must pass a 'node' that was previously rendered for a TextSegment.
        const domRange = document.createRange();
        let left = 0;
        let right = node.textContent.length;
        while (left < right) {
            // tslint:disable-next-line:no-bitwise
            const m = (left + right) >>> 1;
            domRange.setStart(node, m);
            domRange.setEnd(node, m);
            // Note: On Safari 12, 'domRange.getBoundingClientRect()' returns an empty rectangle when domRange start === end.
            //       However, 'getClientRects()' for the same range returns the expected 0-width rect.
            const bounds = domRange.getClientRects()[0];
            const cy = (bounds.top + bounds.bottom) / 2;
            if ((cy < yMin) // Current position is above our target rect.
                || (cy < yMax && bounds.left < x)) { // Current position is within our desired y range.
                left = m + 1;
            }
            else {
                right = m;
            }
        }
        return this.nodeOffsetToSegmentOffset(node, left);
    }
    // Get the ClientRects that define the boundary of the given 'element', using cached information if we have it.
    getClientRects(element) {
        // Note: Caller must only request clientRects for elements we've previously rendered.
        const state = this.state;
        const viewInfo = state.elementToViewInfo.get(element);
        if (!viewInfo.clientRects) {
            viewInfo.clientRects = element.getClientRects();
        }
        return viewInfo.clientRects;
    }
    /**
     * Returns the closest { segment, offset } below the text cursor occupying the 0-width rect
     * described by x/top/bottom.
     */
    findVertical(x, top, bottom, predicate) {
        debug(`looking below: ${bottom}`);
        const state = this.state;
        let bestRect = { top: +Infinity, bottom: -Infinity, left: +Infinity, right: -Infinity };
        let bestDx = +Infinity;
        let bestViewInfo;
        for (const viewInfo of state.elementToViewInfo.values()) {
            // TODO: Better filter for potential cursor targets?
            if (!(viewInfo.view instanceof TextView)) {
                continue;
            }
            const view = viewInfo.view;
            const node = view.root;
            const rects = this.getClientRects(node);
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
        return this.findDomPosition(LayoutContext.getCursorTarget(bestViewInfo.view), Math.min(Math.max(x, bestRect.left), bestRect.right), bestRect.top, bestRect.bottom);
    }
}
DocumentView.findBelowPredicate = (top, bottom, best, candidate) => {
    return candidate.top > top // disqualify rects higher/same original height
        && candidate.top <= best.top; // disqualify rects lower than best match
};
DocumentView.findAbovePredicate = (top, bottom, best, candidate) => {
    return candidate.bottom < bottom // disqualify rects lower/same as starting point
        && candidate.bottom >= best.bottom; // disqualify rects higher than best match
};
// Holds ephemeral state used during layout calculations.
class LayoutContext {
    constructor(doc, state, root, trackedPositions) {
        this.doc = doc;
        this.state = state;
        this.root = root;
        // The IViewInfo for the last rendered inline view.
        // tslint:disable-next-line:variable-name
        this._currentInline = null;
        // Initialize 'pendingTrackedPositions' by copying and sorting the tracked positions.
        this.pendingTrackedPositions = trackedPositions
            .slice(0)
            .sort((left, right) => right.position - left.position);
        // Initialize 'pendingLayout' with the set of root elements rendered in the last layout pass.
        this.pendingLayout = new Set(state.elementToViewInfo.keys());
    }
    // The next tracked position we're looking for.
    get nextTrackedPosition() {
        return this.pendingTrackedPositions[this.pendingTrackedPositions.length - 1];
    }
    get currentInline() { return this._currentInline; }
    /**
     * Returns the given view's designated cursor target, if any.  This is the node within the view that
     * should receive the text caret.
     */
    static getCursorTarget(view) {
        return view.cursorTarget;
    }
    /**
     * Invoked for each DOM node we emit.  Position is the starting position rendered by the current IView.
     */
    notifyTrackedPositionListeners(node, position, segments) {
        const trackedPositions = this.pendingTrackedPositions;
        let topTracked;
        // Notify listeners if we've advanced past a tracked position without intersecting it (e.g., the
        // tracked position is above the rendered window.)  In this case, the calculated position will be
        // negative.
        // tslint:disable-next-line:no-conditional-assignment
        while ((topTracked = this.nextTrackedPosition) && topTracked.position < position) {
            trackedPositions.pop().callback(node, topTracked.position - position);
        }
        // Notify listeners if any of the consumed segments intersected a tracked position.
        let end = position;
        for (const segment of segments) {
            end += segment.cachedLength;
            // tslint:disable-next-line:no-conditional-assignment
            while ((topTracked = this.nextTrackedPosition) && position <= topTracked.position && topTracked.position < end) {
                // Note: Pop() cannot return 'undefined' per the condition 'topTracked !== undefined' above.
                trackedPositions.pop().callback(node, topTracked.position - position);
            }
        }
    }
    // Invoked at completion of the layout pass to unmount all IViews that are no longer in the rendered window.
    unmount() {
        for (const toUnmount of this.pendingLayout) {
            const toUnmountInfo = this.elementToViewInfo(toUnmount);
            this.state.elementToViewInfo.delete(toUnmount);
            toUnmount.remove();
            toUnmountInfo.view.unmount();
        }
        this.pendingLayout.clear();
        // Rebuild the segment -> ViewInfo map from the remaining visible elements.
        this.state.segmentToViewInfo = new Map([...this.state.elementToViewInfo.values()].map((viewInfo) => [viewInfo.segments[0], viewInfo]));
    }
    elementToViewInfo(element) { return this.state.elementToViewInfo.get(element); }
    /**
     * If the given 'segment' is at the head of a list of previously rendered segments, return it's
     * cached ViewInfo and remove that IView from the pendingLayout list.
     */
    maybeReuseViewInfo(segment) {
        const viewInfo = this.state.segmentToViewInfo.get(segment);
        if (viewInfo) {
            this.pendingLayout.delete(viewInfo.view.root);
        }
        return viewInfo;
    }
    setCurrentInline(viewInfo) {
        this._currentInline = viewInfo;
        return viewInfo;
    }
    setViewInfo(viewInfo) {
        this.state.segmentToViewInfo.set(viewInfo.segments[0], viewInfo);
        this.state.elementToViewInfo.set(viewInfo.view.root, viewInfo);
        return viewInfo;
    }
}
// State machine that synchronizes the DOM with the visible portion of the FlowDocument.
export class DocumentLayout {
    // Runs state machine, starting with the paragraph at 'start'.
    static sync(props, state) {
        const paginator = props.paginator;
        const desiredStart = paginator ? paginator.startPosition : 0;
        let start = paginator ? paginator.startingBlockPosition : 0;
        debug(`Sync(${desiredStart}): [${start}..?)`);
        const context = new LayoutContext(props.doc, state, state.slot, props.trackedPositions);
        do {
            // Ensure that we exit the outer do..while loop if there are no remaining segments.
            let nextStart = -1;
            context.doc.visitRange((position, segment, startOffset, endOffset) => {
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
        context.notifyTrackedPositionListeners(LayoutContext.getCursorTarget(context.currentInline.view), +Infinity, []);
        // Any nodes not re-used from the previous layout are unmounted and removed.
        context.unmount();
    }
    static mountView(context, segments, factory, props) {
        const view = factory();
        view.mount(props);
        return context.setViewInfo({
            view,
            segments,
        });
    }
    /**
     * Ensure that the IView for the given set of Segments has been created and that it's root DOM node
     * is at the correct position within the current parent.
     */
    static syncNode(context, previous, segments, factory, props) {
        const parent = context.root;
        // TODO: Check all non-head segments to look for best match?
        let viewInfo = context.maybeReuseViewInfo(segments[0]);
        if (!viewInfo) {
            // Segment was not previously in the rendered window.  Create it.
            viewInfo = this.mountView(context, segments, factory, props);
            // Insert the node for the new segment after the previous block.
            Dom.insertAfter(parent, viewInfo.view.root, previous);
        }
        else {
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
    // Ensures that the given inline 'view' is mounted and up to date.
    static syncInline(context, position, segments, factory, props) {
        const viewInfo = context.setCurrentInline(this.syncNode(context, context.currentInline && context.currentInline.view.root, segments, factory, props));
        const maybeCursorTarget = LayoutContext.getCursorTarget(viewInfo.view);
        context.notifyTrackedPositionListeners(maybeCursorTarget || viewInfo.view.root, position, segments);
    }
    // Ensures that the paragraph's view is mounted and up to date.
    static syncParagraph(context, position, marker) {
        this.syncInline(context, position, [marker], ParagraphView.factory, {});
    }
    // Ensures that the lineBreak's view is mounted and up to date.
    static syncLineBreak(context, position, marker) {
        this.syncInline(context, position, [marker], LineBreakView.factory, {});
    }
    // Ensures that the text's view is mounted and up to date.
    static syncText(context, position, segments, text) {
        this.syncInline(context, position, segments, TextView.factory, { text });
    }
    // Ensures that a foreign inclusion's view is mounted and up to date.
    static syncInclusion(context, position, marker) {
        let child;
        const kind = getInclusionKind(marker);
        child = marker.properties[this.inclusionRootSym];
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
            marker.properties[this.inclusionRootSym] = child;
        }
        this.syncInline(context, position, [marker], InclusionView.factory, { child });
    }
    /**
     * Finds the largest contiguous run of TextSegments that share the same style as 'first', starting at
     * the given 'start' position and returns the concatenated text.
     */
    static concatTextSegments(context, position, first, relativeStartOffset, relativeEndOffset) {
        const accumulator = new TextAccumulator(position, first, relativeStartOffset, relativeEndOffset);
        context.doc.visitRange(accumulator.tryConcat, accumulator.nextPosition, position + relativeEndOffset);
        return accumulator;
    }
    static syncSegment(context, position, segment, start, end) {
        const kind = getDocSegmentKind(segment);
        switch (kind) {
            case DocSegmentKind.Text:
                const textInfo = this.concatTextSegments(context, position, segment, start, end);
                this.syncText(context, textInfo.startPosition, textInfo.segments, textInfo.text);
                // Note: We early exit here with the 'end' of the concatenated range of TextSegments.
                //       This will cause the outer loop to skip to the next TextSegment we haven't yet
                //       processed.  (TODO: Consider pushing/popping processors in the outer loop instead?)
                return textInfo.nextPosition;
            case DocSegmentKind.Paragraph:
                this.syncParagraph(context, position, segment);
                break;
            case DocSegmentKind.LineBreak:
                this.syncLineBreak(context, position, segment);
                break;
            case DocSegmentKind.Inclusion:
                this.syncInclusion(context, position, segment);
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
}
DocumentLayout.inclusionRootSym = Symbol("Flow.Editor.Marker.InclusionRoot");
//# sourceMappingURL=index.js.map