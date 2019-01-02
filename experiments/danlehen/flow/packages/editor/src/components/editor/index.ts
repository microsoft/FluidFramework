import { FlowDocument } from "@chaincode/flow-document";
import { Cursor } from "./cursor";
import { Scheduler } from "@prague/flow-util";
import { DocumentView, IDocumentProps } from "../document";

export class Editor {
    private readonly cursor: Cursor;
    private readonly docProps: IDocumentProps;
    private readonly docView: DocumentView;
    private readonly eventSink: HTMLElement;

    public constructor (private readonly scheduler: Scheduler, private readonly doc: FlowDocument) {
        this.cursor = new Cursor(doc);
        this.cursor.moveTo(0, false);

        this.docProps = { doc, trackedPositions: [], start: 0 };
        this.docView = new DocumentView();
        this.docView.mount(this.docProps);
        this.docView.overlay.appendChild(this.cursor.root);

        this.eventSink = this.docView.eventsink;
        this.eventSink.addEventListener("keydown",   this.onKeyDown as any);
        this.eventSink.addEventListener("keypress",  this.onKeyPress as any);
        this.eventSink.addEventListener("mousedown", this.onMouseDown as any);
        
        window.addEventListener("resize", this.invalidate);

        doc.on("op", this.invalidate);
    }

    public get root() { return this.docView.root; }
    public get cursorPosition() { return this.cursor.position; }

    public readonly invalidate = () => {
        this.scheduler.requestFrame(this.render);
    }

    private readonly render = () => {
        this.docProps.trackedPositions = this.cursor.getTracked();
        // this.docProps.trackedPositions.push({
        //     position: this.docProps.start,
        //     callback: this.scrollToPositionCallback
        // });
        this.docView.update(this.docProps);
        this.cursor.render();

        return this.docView.root;
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
                    const segmentAndOffset = this.docView.findBelow(cursorBounds.left, cursorBounds.top, cursorBounds.bottom);
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
                ev.stopPropagation();
                break;
            }
            default: {
                console.log(`Key: ${ev.key} (${ev.keyCode})`);
                this.doc.insertText(this.cursor.position, ev.key);
                ev.stopPropagation();
                ev.preventDefault();
                break;
            }
        }
    }

    private readonly onMouseDown = (ev: MouseEvent) => {
        const maybeSegmentAndOffset = this.docView.hitTest(ev.x, ev.y);
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