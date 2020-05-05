/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { Caret as CaretUtil, Direction, getDeltaX, getDeltaY, KeyCode, Scheduler } from "@fluid-example/flow-util-lib";
import { IComponent } from "@microsoft/fluid-component-core-interfaces";
import { DocSegmentKind, FlowDocument, getDocSegmentKind } from "../document";
import { Formatter, IFormatterState, RootFormatter } from "../view/formatter";
import { eotSegment, Layout } from "../view/layout";
import { Caret } from "./caret";
import { debug } from "./debug";
import * as styles from "./index.css";

const onKeyDownThunk = (format: Readonly<Formatter<IFormatterState>>, state: Readonly<IFormatterState>, layout: Layout, caret: Caret, e: KeyboardEvent) => {
    return format.onKeyDown(layout, state, caret, e);
};

const onKeyPressThunk = (format: Readonly<Formatter<IFormatterState>>, state: Readonly<IFormatterState>, layout: Layout, caret: Caret, e: KeyboardEvent) => {
    return format.onKeyPress(layout, state, caret, e);
};

const onPasteThunk = (format: Readonly<Formatter<IFormatterState>>, state: Readonly<IFormatterState>, layout: Layout, caret: Caret, e: ClipboardEvent) => {
    return format.onPaste(layout, state, caret, e);
};

export class Editor {
    private get doc() { return this.layout.doc; }

    public get selection() { return this.caret.selection; }
    private readonly layout: Layout;
    private readonly caret: Caret;

    constructor(
        doc: FlowDocument,
        private readonly root: HTMLElement,
        formatter: Readonly<RootFormatter<IFormatterState>>,
        scope?: IComponent) {
        const scheduler = new Scheduler();
        this.layout = new Layout(doc, root, formatter, scheduler, scope);
        this.caret = new Caret(this.layout);

        root.tabIndex = 0;
        root.contentEditable = "true";
        root.addEventListener("paste", this.onPaste);
        root.addEventListener("keydown", this.onKeyDown);
        root.addEventListener("keypress", this.onKeyPress);
    }

    public remove() {
        this.root.contentEditable = "false";
        this.root.removeEventListener("paste", this.onPaste);
        this.root.removeEventListener("keydown", this.onKeyDown);
        this.root.removeEventListener("keypress", this.onKeyPress);
        this.caret.remove();
        this.layout.remove();
    }

    private unlinkChildren(node: Node | HTMLElement) {
        while (node.lastChild) {
            // Leave an inclusion's content alone.
            if ("classList" in node && node.classList.contains(styles.inclusion)) {
                break;
            }
            const child = node.lastChild;
            node.removeChild(child);
            this.unlinkChildren(child);
        }
    }

    private shouldHandleEvent(e: Event) {
        const root = this.layout.root;
        let target = e.target as HTMLElement;

        while (target !== null && target !== root) {
            if (target.classList.contains(styles.inclusion)) {
                return false;
            }
            target = target.parentElement;
        }
        return target === root;
    }

    private readonly onKeyDown = (e: KeyboardEvent) => {
        if (!this.shouldHandleEvent(e)) {
            return;
        }

        switch (e.code) {
            case KeyCode.F1: {
                console.clear();
                break;
            }

            case KeyCode.F2: {
                console.clear();
                this.caret.sync();
                break;
            }

            case KeyCode.F6: {
                this.doc.remove(0, this.doc.length);
                // Fall through to reset
            }

            case KeyCode.F4: {
                console.clear();
                debug("*** RESET ***");
                this.unlinkChildren(this.layout.root);
                // Fall through to sync
            }

            case KeyCode.F3: {
                this.layout.sync();
                break;
            }

            case KeyCode.arrowLeft:
                this.enterIfInclusion(e, this.caret.position - 1, Direction.left);
                break;

            case KeyCode.arrowRight:
                this.enterIfInclusion(e, this.caret.position, Direction.right);
                break;

            default: {
                if (this.delegateEvent(e, onKeyDownThunk)) {
                    this.consume(e);
                }
            }
        }
    };

    private readonly onPaste = (e: ClipboardEvent) => {
        if (this.shouldHandleEvent(e)) {
            this.consume(e);
            this.delegateEvent(e, onPasteThunk);
        }
    };

    private readonly onKeyPress = (e: KeyboardEvent) => {
        if (this.shouldHandleEvent(e)) {
            this.consume(e);
            this.delegateEvent(e, onKeyPressThunk);
        }
    };

    private delegateEvent<TEvent extends Event>(e: TEvent, thunk: (format: Readonly<Formatter<IFormatterState>>, state: Readonly<IFormatterState>, layout: Layout, caret: Caret, e: TEvent) => boolean) {
        const { doc, caret, layout } = this;
        const position = caret.position;
        const segment = caret.position >= doc.length
            ? eotSegment
            : doc.getSegmentAndOffset(position).segment;

        for (const { formatter, state } of layout.getFormats(segment)) {
            if (thunk(formatter, state, layout, caret, e)) {
                return true;
            }
        }

        return false;
    }

    private consume(e: Event) {
        e.preventDefault();
        e.stopPropagation();
    }

    private enterIfInclusion(e: Event, position: number, direction: Direction) {
        const { segment } = this.doc.getSegmentAndOffset(position);
        const kind = getDocSegmentKind(segment);
        if (kind === DocSegmentKind.inclusion) {
            const { node } = this.layout.segmentAndOffsetToNodeAndOffset(segment, 0);
            const bounds = this.caret.bounds;
            debug("Entering inclusion: (dx=%d,dy=%d,bounds=%o)", getDeltaX(direction), getDeltaY(direction), bounds);
            if (CaretUtil.caretEnter(node as Element, direction, bounds)) {
                this.consume(e);
            }
        }
    }
}
