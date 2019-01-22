import { Cursor } from "./cursor";
import { Scheduler } from "@prague/flow-util";
import { DocumentView, IDocumentProps } from "../document";
import { View, IViewState } from "..";
import { shouldIgnoreEvent } from "../inclusion";

export interface IEditorProps extends IDocumentProps { 
    scheduler: Scheduler;
}

interface ListenerRegistration { 
    target: EventTarget,
    type: string,
    listener: EventListener
}

interface IEditorViewState extends IViewState {
    cursor: Cursor;
    docView: DocumentView;
    props: IEditorProps;
    listeners: ListenerRegistration[];
}

export class Editor extends View<IEditorProps, IEditorViewState> {
    private on(listeners: ListenerRegistration[], target: EventTarget, type: string, listener: EventListener) {
        const wrappedListener = (e: Event) => {
            // Ignore events that bubble up from inclusions
            if (shouldIgnoreEvent(e)) {
                return;
            }

            listener(e);
        }
        
        target.addEventListener(type, wrappedListener);
        listeners.push({ target, type, listener: wrappedListener });
    }

    protected mounting(props: Readonly<IEditorProps>): IEditorViewState {
        const cursor = new Cursor(props.doc);
        cursor.moveTo(0, false);

        const docView = new DocumentView();
        const root = docView.mount(props);
        docView.overlay.appendChild(cursor.root);

        const listeners: ListenerRegistration[] = [];
        const eventSink = docView.eventsink;
        this.on(listeners, eventSink, "keydown",   this.onKeyDown as any);
        this.on(listeners, eventSink, "keypress",  this.onKeyPress as any);
        this.on(listeners, eventSink, "mousedown", this.onMouseDown as any);
        this.on(listeners, window,    "resize",    this.invalidate);

        props.doc.on("op", this.invalidate);

        return this.updating(props, {
            root,
            listeners,
            docView,
            props,
            cursor
        });
    }

    protected updating(props: Readonly<IEditorProps>, state: IEditorViewState): IEditorViewState {
        // If the document has changed, remount the document view.
        if (props.doc !== state.props.doc) {
            this.unmounting(state);
            state = this.mounting(props);
        }

        state.docView.update(props);

        return state;
    }

    protected unmounting(state: IEditorViewState): void {
        for (const listener of state.listeners) {
            listener.target.removeEventListener(listener.type, listener.listener);
        }

        this.doc.off("op", this.invalidate);
    }

    private get cursor()         { return this.state.cursor; }
    public  get doc()            { return this.state.props.doc; }
    private get props()          { return this.state.props; }
    public  get cursorPosition() { return this.state.cursor.position; }

    public readonly invalidate = () => {
        this.props.scheduler.requestFrame(this.render);
    }

    private readonly render = () => {
        this.props.trackedPositions = this.cursor.getTracked();
        this.state.docView.update(this.props);
        this.cursor.render();
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
                    const segmentAndOffset = this.state.docView.findBelow(cursorBounds.left, cursorBounds.top, cursorBounds.bottom);
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
        const maybeSegmentAndOffset = this.state.docView.hitTest(ev.x, ev.y);
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