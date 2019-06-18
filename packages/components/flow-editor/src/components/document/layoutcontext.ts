/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { FlowDocument, SegmentSpan } from "@chaincode/flow-document";
import { Dom } from "@prague/flow-util";
import { ISegment } from "@prague/merge-tree";
import { IFlowViewComponent, IViewState } from "..";
import { PagePosition } from "../..";
import { debug } from "../../debug";
import { LayoutSink } from "./layoutsink";
import { template } from "./template";
import { ITrackedPosition } from "./trackedposition";

export type ViewInfo = IViewInfo<unknown, IFlowViewComponent<unknown>>;

/**
 * The state maintained by the DocumentView instance.
 */
export class DocumentViewState implements IViewState {
    /**
     * Mapping from segments to their IViewInfo, if the segment is currently within the rendered window.
     * Note that when a range of segments are rendered by a single view (as is the case with TextSegments
     * that share the same style), only the first segment in the range appears in this map.
     */
    public get segmentToViewInfo() { return this._segmentToViewInfo; }
    public get leadingSpan() { return template.get(this.root, "leadingSpan"); }
    public get slot() { return template.get(this.root, "slot"); }
    public get trailingSpan() { return template.get(this.root, "trailingSpan"); }
    public get overlay() { return template.get(this.root, "overlay"); }

    /**
     * Mapping from the root element produced by an IView to it's IViewInfo.
     */
    public readonly elementToViewInfo = new Map<Element, ViewInfo>();

    public readonly emitted: ViewInfo[] = [];

    // tslint:disable-next-line:variable-name
    private _segmentToViewInfo = new Map<ISegment, ViewInfo>();

    constructor(
        public readonly doc: FlowDocument,
        public readonly root: Element,
        public start?: PagePosition,
        public end?: PagePosition,
    ) { }

    public rebuildElementToViewInfo() {
        this._segmentToViewInfo = new Map<ISegment, ViewInfo>(
            [...this.elementToViewInfo.values()].map<[ISegment, IViewInfo<any, IFlowViewComponent<any>>]>(
                (viewInfo) => [viewInfo.span.firstSegment, viewInfo]));
    }
}

/**
 * The state that is calculated/cached for each segment within the currently rendered
 * window.
 */
export interface IViewInfo<TProps, TView extends IFlowViewComponent<TProps>> {
    view: TView;
    span: SegmentSpan;
}

// Holds ephemeral state used during layout calculations.
export class LayoutContext {
    // The next tracked position we're looking for.
    private get nextTrackedPosition() {
        return this.pendingTrackedPositions[this.pendingTrackedPositions.length - 1];
    }

    public get lastEmitted() { return this.emitted[this.emitted.length - 1]; }

    /**
     * Sorted stack of tracked position we're still looking for.
     * Positions are popped from the stack as the consumers are notified.
     */
    private readonly pendingTrackedPositions: ITrackedPosition[];

    private readonly pendingNotifications = [];

    /**
     * Set of previously rendered Elements that have not yet been encountered by
     * this layout pass. Any remaining elements are unmounted at the end of the layout pass
     * as they are no longer within the rendered window.
     */
    private readonly pendingLayout: Set<Element>;

    // tslint:disable-next-line:array-type
    private readonly layouts: { layout: LayoutSink<unknown>, state: unknown }[] = [];

    private readonly parentAndPrevious: Array<{ parent: Element, previous: Element }>;

    constructor(
        readonly doc: FlowDocument,
        readonly state: DocumentViewState,
        root: Element,
        trackedPositions: ITrackedPosition[],
        private readonly halt: (context: LayoutContext) => boolean,
    ) {
        this.emitted.length = 0;
        this.parentAndPrevious = [{ parent: root, previous: undefined }];

        // Initialize 'pendingTrackedPositions' by copying and sorting the tracked positions.
        this.pendingTrackedPositions = trackedPositions
            .slice(0)
            .sort((left, right) => right.position - left.position);

        // Initialize 'pendingLayout' with the set of root elements rendered in the last layout pass.
        this.pendingLayout = new Set<Element>(state.elementToViewInfo.keys());
    }

    public get emitted() { return this.state.emitted; }

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
        this.state.rebuildElementToViewInfo();

        // Dispatch pending notifications for positions we passed during our layout.
        for (const { node, nodeOffset, callback } of this.pendingNotifications) {
            callback(node, nodeOffset);
        }

        // Notify listeners whose tracked positions were after our rendered window.
        {
            const lastNode = this.state.trailingSpan;
            const trackedPositions = this.pendingTrackedPositions;

            for (let i = trackedPositions.length - 1; i >= 0; i--) {
                trackedPositions[i].callback(lastNode, +Infinity);
            }
        }
    }

    public elementToViewInfo(element: Element) { return this.state.elementToViewInfo.get(element); }

    public pushNode<TProps, TView extends IFlowViewComponent<TProps>>(
        span: SegmentSpan,
        factory: () => TView,
        props: TProps,
    ) {
        const viewInfo = this.emitNode(span, factory, props);
        this.parentAndPrevious.push({ parent: viewInfo.view.root, previous: undefined });
    }

    /**
     * Ensure that the IView for the given set of Segments has been created and that it's root DOM node
     * is at the correct position within the current parent.
     */
    public emitNode<TProps, TView extends IFlowViewComponent<TProps>>(
        span: SegmentSpan,
        factory: () => TView,
        props: TProps,
    ): IViewInfo<TProps, TView> {
        const parent = this.parent;
        const previous = this.previous;

        let viewInfo = this.state.segmentToViewInfo.get(span.firstSegment);
        if (viewInfo) {
            viewInfo.span = span;
            const view = viewInfo.view;
            view.update(props);

            // The node was previously inside the rendered window.  See if it is already in the correct location.
            const root = view.root;
            if (!Dom.isAfterNode(parent, root, previous)) {
                // The node is not in the correct position.  Move it.
                //
                // Sometimes we have a choice if we move the cached node or the one already residing in the
                // expected position. We can prefer to move nodes known not to have side effects (i.e.,
                // do not move inclusion if possible, and never move the node containing focus.)
                Dom.insertAfter(parent, root, previous);
            }

            this.pendingLayout.delete(root);
        } else {
            // Segment was not previously in the rendered window. Create it.
            const view = factory();
            view.mount(props);

            // Insert the node for the new segment after the previous block.
            Dom.insertAfter(parent, view.root, previous);

            viewInfo = { view, span };
        }

        // Add the emitted node to our tracking data structures.
        this.state.segmentToViewInfo.set(viewInfo.span.firstSegment, viewInfo);
        const viewRoot = viewInfo.view.root;
        this.state.elementToViewInfo.set(viewRoot, viewInfo);
        this.previous = viewRoot;
        this.emitted.push(viewInfo);

        this.notifyTrackedPositionListeners(viewInfo.view.cursorTarget, span);

        return viewInfo as IViewInfo<TProps, TView>;
    }

    public popNode() {
        this.parentAndPrevious.pop();
    }

    public pushLayout(layout: LayoutSink<unknown>, position: number, segment: ISegment, startOffset: number, endOffset: number) {
        this.layouts.push({
            layout,
            state: layout.onPush(this, position, segment, startOffset, endOffset),
        });
    }

    public layout(position: number, segment: ISegment, startOffset: number, endOffset: number) {
        let accepted: boolean;

        do {
            const previousEmitted = this.emitted.length;
            const { layout, state } = this.layouts[this.layouts.length - 1];

            accepted = layout.tryAppend(state, this, position, segment, startOffset, endOffset);

            // If the current layout sink did not accept the segment, pop the stack.
            if (!accepted) {
                if (!this.popLayout()) {
                    throw new Error();
                }
            }

            // If 'tryAppend()' or 'popLayout()' emitted nodes, give the 'halt()' callback an
            // opportunity to stop the layout pass (e.g., for pagination or virtualization).
            if (this.emitted.length !== previousEmitted && this.halt(this)) {
                return false;
            }

            // If 'tryAppend()' did not accept the segment then we've popped the stack and
            // should try again with the LayoutSink now at the top.
        } while (!accepted);

        return true;
    }

    public popLayout() {
        if (this.layouts.length === 0) {
            return false;
        }

        const { layout, state } = this.layouts.pop();
        layout.onPop(state, this);
        return true;
    }

    private get topParentAndPrevious() { return this.parentAndPrevious[this.parentAndPrevious.length - 1]; }
    private get parent() { return this.topParentAndPrevious.parent; }
    private get previous() { return this.topParentAndPrevious.previous; }
    private set previous(value: Element) { this.topParentAndPrevious.previous = value; }

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
