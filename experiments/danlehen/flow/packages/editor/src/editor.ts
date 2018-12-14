import { FlowDocument } from "@chaincode/flow-document";
import { Cursor } from "./cursor";
import { Scheduler } from "@prague/flow-util";
import { IDocumentViewState, DocumentView, IDocumentProps } from "./components/document";
// import { ViewportView, IViewportViewState } from "./components/viewport";
// import { Dom } from "./dom";
import { ISequencedObjectMessage } from "@prague/runtime-definitions";

export class Editor {
    private readonly cursor: Cursor;
//    private viewportState: IViewportViewState;
    private readonly docProps: IDocumentProps;
    private readonly docState: IDocumentViewState;
    private readonly eventSink: HTMLElement;
//    private scrollY = 0;

    public constructor (private readonly scheduler: Scheduler, private readonly doc: FlowDocument) {
        this.cursor = new Cursor(doc);
        this.cursor.moveTo(0, false);

        this.docProps = { doc, trackedPositions: [], start: 0 };
        this.docState = DocumentView.instance.mount(this.docProps);
        this.docState.overlay.appendChild(this.cursor.root);

        // this.viewportState = ViewportView.instance.mount(this.getViewportProps(0));
        // this.viewportState.slot.appendChild(this.docState.root);

        this.eventSink = this.docState.slot;
        this.eventSink.addEventListener("keydown",   this.onKeyDown as any);
        this.eventSink.addEventListener("keypress",  this.onKeyPress as any);
        this.eventSink.addEventListener("mousedown", this.onMouseDown as any);
        
        // this.eventSink.addEventListener("focusin", this.onFocus);
        // this.syncFocus();

        window.addEventListener("resize", this.invalidate);

        doc.on("op", (op: ISequencedObjectMessage, local: boolean) => {
            if (local) { return; }
            this.invalidate()
        });

        this.invalidate();
    }

    // public get root() { return this.viewportState.root; }
    public get root() { return this.docState.root; }
/*
    private getViewportProps(scrollY: number) {
        return {
            yMin: 0,
            yMax: this.doc.length,
            onScroll: this.onScroll,
            scrollY
        }
    }
*/
    public get cursorPosition() { return this.cursor.position; }
/*
    private readonly onScroll = (position: number) => {
        Object.assign(this.docProps, { start: position });
        this.invalidate();
    };
*/
    public readonly invalidate = () => {
        this.scheduler.requestFrame(this.render);
    }

    // private readonly scrollToPositionCallback = (node: Node, nodeOffset: number) => {
    //     requestAnimationFrame(() => {
    //         console.log(`Scrolling to: ${node}@${nodeOffset}`);

    //         const bounds = Dom.getClientRect(node, nodeOffset);
    //         console.log(`    top: ${bounds.top}, scrollY: ${this.scrollY}`);
    //         if (bounds) {
    //             const currentY = parseFloat(this.viewportState.slot.style.marginTop || "0");
    //             const relativeTop = bounds.top                                  // The current top of the viewport slot in screen coordinates
    //                 - this.viewportState.root.getBoundingClientRect().top       // The current top of the viewport in screen coordinates
    //                 - currentY;                                                 // The current transform

    //             this.viewportState = ViewportView.instance.update(this.getViewportProps(relativeTop), this.viewportState);
    //             console.log(`        -> scrollY: ${this.scrollY} (currentY: ${currentY})`);
    //         }
    //     });
    // };

    private readonly render = () => {
        this.docProps.trackedPositions = this.cursor.getTracked();
        // this.docProps.trackedPositions.push({
        //     position: this.docProps.start,
        //     callback: this.scrollToPositionCallback
        // });
        DocumentView.instance.update(this.docProps, this.docState);
        this.cursor.render();

        return this.docState.root;
    }

    private readonly onKeyDown = async (ev: KeyboardEvent) => {
        switch (ev.keyCode) {
            case 8: {
                // Note: Chrome 69 delivers backspace on 'keydown' only (i.e., 'keypress' is not fired.)
                //       Safari 12 delivers backspace on both 'keydown' and 'keypress'.
                const start = this.cursor.selectionStart;
                const end = this.cursor.position;

                if (start === end) {
                    // If no range is currently selected, delete the preceding character (if any).
                    this.doc.remove(start - 1, start);
                } else {
                    // Otherwise, delete the selected range.
                    this.doc.remove(Math.min(start, end), Math.max(start, end));
                }
                this.invalidate();
                ev.stopPropagation();
                break;
            }
            case 37: {
                this.cursor.moveBy(-1, ev.shiftKey);
                this.invalidate();
                ev.stopPropagation();
                break;
            }
            case 39: {
                this.cursor.moveBy(+1, ev.shiftKey);
                this.invalidate();
                ev.stopPropagation();
                break;
            }
            case 40: {
                const cursorBounds = await this.cursor.bounds;
                if (cursorBounds) {
                    const segmentAndOffset = DocumentView.instance.findBelow(this.docState, cursorBounds.left, cursorBounds.top, cursorBounds.bottom);
                    if (segmentAndOffset) {
                        const position = this.doc.getPosition(segmentAndOffset.segment!);
                        this.cursor.moveTo(position + segmentAndOffset.offset, ev.shiftKey);
                        this.invalidate();
                        ev.stopPropagation();
                    }
                }
                break;
            }
            default: {
                console.log(`Key: ${ev.key} (${ev.keyCode})`);
                break;
            }
        }
    }

    private readonly onKeyPress = (ev: KeyboardEvent) => {
        switch (ev.keyCode) {
            case 8: {
                // Note: Backspace handled on 'keydown' event to support Chrome 69 (see comment in 'onKeyDown').
                break;
            }
            case 13: {
                if (ev.shiftKey) {
                    this.doc.insertLineBreak(this.cursor.position);
                } else {
                    this.doc.insertParagraph(this.cursor.position);
                }
                this.invalidate();
                ev.stopPropagation();
                break;
            }
            default: {
                console.log(`Key: ${ev.key} (${ev.keyCode})`);
                this.doc.insertText(this.cursor.position, ev.key);
                this.invalidate();
                ev.stopPropagation();
                ev.preventDefault();
                break;
            }
        }
    }

    private readonly onMouseDown = (ev: MouseEvent) => {
        const maybeSegmentAndOffset = DocumentView.instance.hitTest(this.docState, ev.x, ev.y);
        if (maybeSegmentAndOffset) {
            const { segment, offset } = maybeSegmentAndOffset;
            const position = Math.min(
                this.doc.getPosition(segment) + offset,
                this.doc.length - 1);
            this.cursor.moveTo(position, false);
            this.invalidate();
            ev.stopPropagation();
        }
    }
}