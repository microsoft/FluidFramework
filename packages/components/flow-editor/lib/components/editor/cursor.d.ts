import { FlowDocument } from "@chaincode/flow-document";
export declare class Cursor {
    private readonly doc;
    readonly selectionStart: number;
    readonly position: number;
    readonly bounds: ClientRect;
    readonly root: HTMLElement;
    private startRef;
    private endRef;
    private startContainer?;
    private relativeStartOffset;
    private endContainer?;
    private relativeEndOffset;
    private cursorBounds?;
    private readonly domRange;
    private readonly highlightRootElement;
    private readonly cursorElement;
    constructor(doc: FlowDocument);
    moveTo(position: number, extendSelection: boolean): void;
    moveBy(delta: number, extendSelection: boolean): void;
    getTracked(): {
        position: number;
        callback: (node: Node, nodeOffset: number) => void;
    }[];
    show(): void;
    hide(): void;
    readonly render: () => HTMLElement;
    private clampPosition;
    private addLocalRef;
    private setSelectionStart;
    private setPosition;
    private clampToText;
    private setRangeStart;
    private setRangeEnd;
    /**
     * Returns the top/left offset of nearest ancestor that is a CSS containing block, used to
     * adjust absolute the x/y position of the caret/highlight.
     */
    private getOffset;
    private updateSelection;
    private getCursorBounds;
    private updateCursor;
    private readonly updateDomRangeStart;
    private readonly updateDomRangeEnd;
    private restartBlinkAnimation;
}
//# sourceMappingURL=cursor.d.ts.map