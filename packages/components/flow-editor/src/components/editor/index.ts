import { DocSegmentKind, getDocSegmentKind } from "@chaincode/flow-document";
import { CaretEventType, Direction, ICaretEvent, KeyCode, Scheduler } from "@prague/flow-util";
import { IViewState, View } from "..";
import { SequenceDeltaEvent } from "../../../../../runtime/sequence/dist";
import { debug } from "../../debug";
import { IPaginationProvider, PagePosition } from "../../pagination";
import { DocumentView, IDocumentProps } from "../document";
import { shouldIgnoreEvent } from "../inclusion";
import { Cursor } from "./cursor";
import * as style from "./index.css";

export interface IEditorProps extends IDocumentProps {
    scheduler: Scheduler;
    eventSink?: HTMLElement;
}

interface IListenerRegistration {
    target: EventTarget;
    type: string;
    listener: EventListener;
}

interface IEditorViewState extends IViewState {
    cursor: Cursor;
    docView: DocumentView;
    eventSink: HTMLElement;
    props: IEditorProps;
    listeners: IListenerRegistration[];
}

export class Editor extends View<IEditorProps, IEditorViewState> implements IPaginationProvider {
    private get cursor()         { return this.state.cursor; }
    public  get doc()            { return this.state.props.doc; }
    private get props()          { return this.state.props; }
    public  get cursorPosition() { return this.state.cursor.position; }
    public  get selection()      { return this.state.cursor.selection; }
    public invalidate?: () => void;

    private readonly onCaretLeave = ((e: ICaretEvent) => {
        this.state.eventSink.focus();
        const direction = e.detail.direction;
        const extendSelection = false;

        switch (direction) {
            case Direction.left:
                this.cursor.moveTo(this.state.docView.getPosition(e.target as Node), extendSelection);
                this.horizontalArrow(e, -1, /* extendSelection: */ false);
                break;
            case Direction.right:
                this.cursor.moveTo(this.state.docView.getPosition(e.target as Node), extendSelection);
                this.horizontalArrow(e, 1, /* extendSelection: */ false);
                break;
            case Direction.up:
                this.verticalArrow(e, -1, e.detail.caretBounds, /* extendSelection */ false);
                break;
            case Direction.down:
                this.verticalArrow(e, 1, e.detail.caretBounds, /* extendSelection */ false);
                break;
            default:
        }
    }) as EventHandlerNonNull;

    constructor() {
        super();
    }

    public paginate(start: PagePosition, budget: number) {
        Object.assign(this.props, { start, paginationBudget: budget });
        this.update(this.props);
        return this.state.docView.paginationStop;
    }

    protected mounting(props: Readonly<IEditorProps>): IEditorViewState {
        const scheduler = props.scheduler;
        this.invalidate = scheduler.coalesce(scheduler.onLayout, this.render);

        const cursor = new Cursor(props.doc, scheduler);
        cursor.moveTo(0, false);

        const docView = new DocumentView();
        const root = docView.mount(props);
        docView.overlay.appendChild(cursor.root);

        const listeners: IListenerRegistration[] = [];
        const eventSink = (props.eventSink || root) as HTMLElement;
        this.on(listeners, eventSink, "keydown",   this.onKeyDown);
        this.on(listeners, eventSink, "keypress",  this.onKeyPress);
        this.on(listeners, eventSink, "mousedown", this.onMouseDown);
        this.on(listeners, window,    "resize",    this.invalidate);
        this.on(listeners, eventSink, "blur",      this.onBlur);
        this.on(listeners, eventSink, "focus",     this.onFocus);

        root.addEventListener(CaretEventType.leave, this.onCaretLeave);

        props.doc.on("sequenceDelta", (e: SequenceDeltaEvent) => {
            const { start, end } = this.state.docView.range;
            if (start < e.end && e.start < end) {
                this.invalidate();
            }
        });

        return this.updating(props, {
            root,
            listeners,
            docView,
            eventSink,
            props,
            cursor,
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

        this.doc.off("sequenceDelta", this.invalidate);
    }

    private on<K extends keyof HTMLElementEventMap>(listeners: IListenerRegistration[], target: EventTarget, type: K | string, listener: (ev: HTMLElementEventMap[K]) => any) {
        const wrappedListener = (e: Event) => {
            // Ignore events that bubble up from inclusions
            if (shouldIgnoreEvent(e)) {
                return;
            }

            listener(e);
        };

        target.addEventListener(type, wrappedListener);
        listeners.push({ target, type, listener: wrappedListener });
    }

    private readonly render = () => {
        // Avoid modifying window selection when Flow-Editor is not displaying cursor
        this.props.trackedPositions = document.activeElement === this.state.eventSink
            ? this.cursor.getTracked()
            : [];

        this.state.docView.update(this.props);
        this.cursor.render();
    }

    private delete(deltaStart: number, deltaEnd: number) {
        const { start, end } = this.cursor.selection;
        if (start === end) {
            // If no range is currently selected, delete the preceding character (if any).
            this.doc.remove(start + deltaStart, end + deltaEnd);
        } else {
            // Otherwise, delete the selected range.
            this.doc.remove(Math.min(start, end), Math.max(start, end));
        }
    }

    private insertText(text: string) {
        const { start, end } = this.cursor.selection;
        if (start === end) {
            this.doc.insertText(end, text);
        } else {
            this.doc.replaceWithText(Math.min(start, end), Math.max(start, end), text);
        }
    }

    private horizontalArrow(ev: Event, deltaX: number, extendSelection: boolean) {
        this.cursor.moveBy(deltaX, extendSelection);

        const maybeView = this.state.docView.getInclusionView(this.cursorPosition);
        if (maybeView) {
            const direction = deltaX > 0
                ? Direction.right
                : Direction.left;
            maybeView.caretEnter(direction, this.cursor.bounds);
        }

        this.invalidate();
        ev.preventDefault();
        ev.stopPropagation();
    }

    private verticalArrow(ev: Event, deltaY: number, caretBounds: ClientRect, extendSelection: boolean) {
        if (caretBounds) {
            const searchFn = deltaY > 0
                ? this.state.docView.findBelow
                : this.state.docView.findAbove;

            const segmentAndOffset = searchFn(caretBounds.left, caretBounds.top, caretBounds.bottom);
            if (segmentAndOffset) {
                const { segment, offset } = segmentAndOffset;
                const maybeView = getDocSegmentKind(segmentAndOffset.segment) === DocSegmentKind.Inclusion
                    && this.state.docView.getInclusionView(this.doc.getPosition(segment) + offset);

                if (maybeView) {
                    const direction = deltaY > 0
                        ? Direction.down
                        : Direction.up;

                    maybeView.caretEnter(direction, this.cursor.bounds);
                } else {
                    const position = this.doc.getPosition(segmentAndOffset.segment);
                    this.cursor.moveTo(position + segmentAndOffset.offset, extendSelection);
                    this.invalidate();
                }

                ev.preventDefault();
                ev.stopPropagation();
            }
        }
    }

    private readonly onKeyDown = (ev: KeyboardEvent) => {
        const keyCode = ev.code;
        switch (keyCode) {
            // Note: Chrome 69 delivers backspace on 'keydown' only (i.e., 'keypress' is not fired.)
            case KeyCode.backspace: {
                this.delete(-1, 0);
                ev.preventDefault();
                ev.stopPropagation();
                break;
            }
            case KeyCode.delete: {
                this.delete(0, 1);
                ev.preventDefault();
                ev.stopPropagation();
                break;
            }
            case KeyCode.arrowLeft: {
                this.horizontalArrow(ev, -1, ev.shiftKey);
                break;
            }
            case KeyCode.arrowRight: {
                this.horizontalArrow(ev, +1, ev.shiftKey);
                break;
            }
            case KeyCode.arrowDown: {
                this.verticalArrow(ev, 1, this.cursor.bounds, ev.shiftKey);
                break;
            }
            case KeyCode.arrowUp: {
                this.verticalArrow(ev, -1, this.cursor.bounds, ev.shiftKey);
                break;
            }
            default: {
                debug(`Key: ${ev.key} (${ev.keyCode})`);
            }
        }
    }

    private toggleCssClass(ev: KeyboardEvent, className: string) {
        const { start, end } = this.cursor.selection;
        this.doc.toggleCssClass(start, end, className);
        ev.stopPropagation();
        ev.preventDefault();
    }

    private readonly onKeyPress = (ev: KeyboardEvent) => {
        if (ev.ctrlKey) {
            switch (ev.key) {
                case "b":
                    this.toggleCssClass(ev, style.bold);
                    return;
                case "i":
                    this.toggleCssClass(ev, style.italic);
                    return;
                case "u":
                    this.toggleCssClass(ev, style.underline);
                    return;
                default:
            }
        } else {
            switch (ev.code) {
                case KeyCode.backspace: {
                    // Note: Backspace handled on 'keydown' event to support Chrome 69 (see comment in 'onKeyDown').
                    break;
                }
                case KeyCode.enter: {
                    if (ev.shiftKey) {
                        this.doc.insertLineBreak(this.cursor.position);
                    } else {
                        this.doc.insertParagraph(this.cursor.position);
                    }
                    ev.stopPropagation();
                    break;
                }
                default: {
                    this.insertText(ev.key);
                    ev.stopPropagation();
                    ev.preventDefault();
                }
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

    private readonly onFocus = () => {
        this.cursor.show();
    }

    private readonly onBlur = () => {
        this.cursor.hide();
    }
}
