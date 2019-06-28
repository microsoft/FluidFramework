import { View } from "..";
import { debug } from "../../debug";
import { DocumentView } from "../document";
import { shouldIgnoreEvent } from "../inclusion";
import { Cursor } from "./cursor";
export class Editor extends View {
    constructor() {
        super();
        this.render = () => {
            this.props.trackedPositions = this.cursor.getTracked();
            this.state.docView.update(this.props);
            this.cursor.render();
        };
        this.onKeyDown = (ev) => {
            const keyCode = ev.keyCode;
            switch (keyCode) {
                // Note: Chrome 69 delivers backspace on 'keydown' only (i.e., 'keypress' is not fired.)
                case 8 /* Backspace */: {
                    this.delete(-1, 0);
                    ev.stopPropagation();
                    break;
                }
                case 46 /* Delete */: {
                    this.delete(0, 1);
                    ev.stopPropagation();
                    break;
                }
                case 37 /* LeftArrow */: {
                    this.horizontalArrow(ev, -1);
                    break;
                }
                case 39 /* RightArrow */: {
                    this.horizontalArrow(ev, +1);
                    break;
                }
                case 40 /* DownArrow */: {
                    this.verticalArrow(ev, this.state.docView.findBelow);
                    break;
                }
                case 38 /* UpArrow */: {
                    this.verticalArrow(ev, this.state.docView.findAbove);
                    break;
                }
                default: {
                    debug(`Key: ${ev.key} (${ev.keyCode})`);
                }
            }
        };
        this.onKeyPress = (ev) => {
            switch (ev.keyCode) {
                case 8 /* Backspace */: {
                    // Note: Backspace handled on 'keydown' event to support Chrome 69 (see comment in 'onKeyDown').
                    break;
                }
                case 13 /* Enter */: {
                    if (ev.shiftKey) {
                        this.doc.insertLineBreak(this.cursor.position);
                    }
                    else {
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
        };
        this.onMouseDown = (ev) => {
            const maybeSegmentAndOffset = this.state.docView.hitTest(ev.x, ev.y);
            if (maybeSegmentAndOffset) {
                const { segment, offset } = maybeSegmentAndOffset;
                const position = Math.min(this.doc.getPosition(segment) + offset, this.doc.length - 1);
                this.cursor.moveTo(position, false);
                this.invalidate();
                ev.stopPropagation();
            }
        };
        // TODO: Kludge: We temporarily assign invalidate -> render until we get our scheduler in mount().
        this.invalidate = this.render;
    }
    get cursor() { return this.state.cursor; }
    get doc() { return this.state.props.doc; }
    get props() { return this.state.props; }
    get cursorPosition() { return this.state.cursor.position; }
    mounting(props) {
        const scheduler = props.scheduler;
        this.invalidate = scheduler.coalesce(this.render);
        const cursor = new Cursor(props.doc);
        cursor.moveTo(0, false);
        const docView = new DocumentView();
        const root = docView.mount(props);
        docView.overlay.appendChild(cursor.root);
        const listeners = [];
        const eventSink = props.eventSink || root;
        this.on(listeners, eventSink, "keydown", this.onKeyDown);
        this.on(listeners, eventSink, "keypress", this.onKeyPress);
        this.on(listeners, eventSink, "mousedown", this.onMouseDown);
        this.on(listeners, window, "resize", this.invalidate);
        props.doc.on("op", this.invalidate);
        return this.updating(props, {
            root,
            listeners,
            docView,
            eventSink,
            props,
            cursor,
        });
    }
    updating(props, state) {
        // If the document has changed, remount the document view.
        if (props.doc !== state.props.doc) {
            this.unmounting(state);
            state = this.mounting(props);
        }
        state.docView.update(props);
        return state;
    }
    unmounting(state) {
        for (const listener of state.listeners) {
            listener.target.removeEventListener(listener.type, listener.listener);
        }
        this.doc.off("op", this.invalidate);
    }
    on(listeners, target, type, listener) {
        const wrappedListener = (e) => {
            // Ignore events that bubble up from inclusions
            if (shouldIgnoreEvent(e)) {
                return;
            }
            listener(e);
        };
        target.addEventListener(type, wrappedListener);
        listeners.push({ target, type, listener: wrappedListener });
    }
    delete(deltaStart, deltaEnd) {
        const start = this.cursor.selectionStart;
        const end = this.cursor.position;
        if (start === end) {
            // If no range is currently selected, delete the preceding character (if any).
            this.doc.remove(start + deltaStart, end + deltaEnd);
        }
        else {
            // Otherwise, delete the selected range.
            this.doc.remove(Math.min(start, end), Math.max(start, end));
        }
    }
    insertText(text) {
        const start = this.cursor.selectionStart;
        const end = this.cursor.position;
        if (start === end) {
            this.doc.insertText(end, text);
        }
        else {
            this.doc.replaceWithText(Math.min(start, end), Math.max(start, end), text);
        }
    }
    horizontalArrow(ev, deltaX) {
        this.cursor.moveBy(deltaX, ev.shiftKey);
        this.invalidate();
        ev.stopPropagation();
    }
    verticalArrow(ev, searchFn) {
        const cursorBounds = this.cursor.bounds;
        if (cursorBounds) {
            const segmentAndOffset = searchFn(cursorBounds.left, cursorBounds.top, cursorBounds.bottom);
            if (segmentAndOffset) {
                const position = this.doc.getPosition(segmentAndOffset.segment);
                this.cursor.moveTo(position + segmentAndOffset.offset, ev.shiftKey);
                this.invalidate();
                ev.stopPropagation();
            }
        }
    }
}
//# sourceMappingURL=index.js.map