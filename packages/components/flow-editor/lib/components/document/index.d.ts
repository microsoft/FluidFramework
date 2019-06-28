import { FlowDocument } from "@chaincode/flow-document";
import { ISegment } from "@prague/merge-tree";
import { IFlowViewComponent, IViewState, View } from "../";
import { Paginator } from "./paginator";
/**
 * A position in the FlowDocument and a callback to be invoked with the DOM node
 * and offset within the dom node where that position is rendered.
 */
export interface ITrackedPosition {
    position: number;
    callback: (node: Node, nodeOffset: number) => void;
}
/**
 * The state to be visualized/edited by the DocumentView.
 */
export interface IDocumentProps {
    doc: FlowDocument;
    trackedPositions: ITrackedPosition[];
    paginator?: Paginator;
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
    segments: ISegment[];
    view: TView;
    clientRects?: ClientRectList | DOMRectList;
}
/**
 * The state maintained by the DocumentView instance.
 */
interface IDocumentViewState extends IViewState {
    slot: HTMLElement;
    overlay: Element;
    leadingSpan: Element;
    trailingSpan: Element;
    /**
     * Mapping from segments to their IViewInfo, if the segment is currently within the rendered window.
     * Note that when a range of segments are rendered by a single view (as is the case with TextSegments
     * that share the same style), only the first segment in the range appears in this map.
     */
    segmentToViewInfo: Map<ISegment, IViewInfo<any, IFlowViewComponent<any>>>;
    /**
     * Mapping from the root element produced by an IView to it's IViewInfo.
     */
    elementToViewInfo: Map<Element, IViewInfo<any, IFlowViewComponent<any>>>;
}
export declare class DocumentView extends View<IDocumentProps, IDocumentViewState> {
    readonly root: Element;
    readonly overlay: Element;
    private static readonly findBelowPredicate;
    private static readonly findAbovePredicate;
    hitTest(x: number, y: number): {
        segment: ISegment;
        offset: number;
    };
    /**
     * Returns the closest { segment, offset } below the text cursor occupying the 0-width rect
     * described by x/top/bottom.
     */
    readonly findBelow: (x: number, top: number, bottom: number) => {
        segment: ISegment;
        offset: number;
    };
    /**
     * Returns the closest { segment, offset } below the text cursor occupying the 0-width rect
     * described by x/top/bottom.
     */
    readonly findAbove: (x: number, top: number, bottom: number) => {
        segment: ISegment;
        offset: number;
    };
    protected mounting(props: IDocumentProps): Readonly<IDocumentViewState>;
    protected updating(props: Readonly<IDocumentProps>, state: Readonly<IDocumentViewState>): Readonly<IDocumentViewState>;
    protected unmounting(): void;
    private nodeOffsetToSegmentOffset;
    private findDomPosition;
    private getClientRects;
    /**
     * Returns the closest { segment, offset } below the text cursor occupying the 0-width rect
     * described by x/top/bottom.
     */
    private findVertical;
}
export declare class DocumentLayout {
    static sync(props: IDocumentProps, state: IDocumentViewState): void;
    private static readonly inclusionRootSym;
    private static mountView;
    /**
     * Ensure that the IView for the given set of Segments has been created and that it's root DOM node
     * is at the correct position within the current parent.
     */
    private static syncNode;
    private static syncInline;
    private static syncParagraph;
    private static syncLineBreak;
    private static syncText;
    private static syncInclusion;
    /**
     * Finds the largest contiguous run of TextSegments that share the same style as 'first', starting at
     * the given 'start' position and returns the concatenated text.
     */
    private static concatTextSegments;
    private static syncSegment;
}
export {};
//# sourceMappingURL=index.d.ts.map