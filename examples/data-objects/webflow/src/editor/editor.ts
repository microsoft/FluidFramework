/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Caret as CaretUtil, Direction, getDeltaX, getDeltaY, KeyCode, Scheduler } from "@fluid-example/flow-util-lib";
import { FluidObject } from "@fluidframework/core-interfaces";
import { IFluidHTMLView } from "@fluidframework/view-interfaces";
import { paste } from "../clipboard/paste";
import { DocSegmentKind, FlowDocument, getDocSegmentKind } from "../document";
import { ownsNode } from "../util/event";
import { IFormatterState, RootFormatter } from "../view/formatter";
import { Layout } from "../view/layout";
import { Caret } from "./caret";
import { debug } from "./debug";
import * as styles from "./index.css";

/**
 * The Host provides the Editor with a registry of view factories which will be used to render components that have
 * been inserted into the document.
 */
export interface IFluidHTMLViewFactory {
    createView(model: FluidObject, scope?: FluidObject): IFluidHTMLView;
}

export class Editor {
    private readonly layout: Layout;
    private readonly caret: Caret;
    private readonly caretSync: () => void;
    private get doc() { return this.layout.doc; }

    constructor(doc: FlowDocument, private readonly root: HTMLElement, formatter: Readonly<RootFormatter<IFormatterState>>, viewFactoryRegistry?: Map<string, IFluidHTMLViewFactory>, scope?: FluidObject) {
        const scheduler = new Scheduler();
        this.layout = new Layout(doc, root, formatter, scheduler, viewFactoryRegistry, scope);
        this.caret = new Caret(this.layout);
        this.caretSync = scheduler.coalesce(scheduler.onTurnEnd, () => { this.caret.sync(); });
        this.layout.on("render", this.caretSync);

        root.tabIndex = 0;
        root.contentEditable = "true";
        root.addEventListener("paste", this.onPaste);
        root.addEventListener("keydown", this.onKeyDown);
        root.addEventListener("keypress", this.onKeyPress);
    }

    public get selection() { return this.caret.selection; }

    public remove() {
        this.root.contentEditable = "false";
        this.root.removeEventListener("paste", this.onPaste);
        this.root.removeEventListener("keydown", this.onKeyDown);
        this.root.removeEventListener("keypress", this.onKeyPress);
        this.layout.removeListener("render", this.caretSync);
        this.layout.remove();
    }

    private delete(e: Event, direction: Direction) {
        this.consume(e);

        const caret = this.caret;
        let { start, end } = caret.selection;

        if (start === end) {
            // If no range is currently selected, delete the preceding character (if any).
            const dx = getDeltaX(direction);
            if (dx < 0) {
                start--;
            } else {
                end++;
            }
        }

        const doc = this.doc;
        doc.remove(Math.max(0, start), Math.min(end, doc.length));
        caret.collapseForward();
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
        return ownsNode(this.root, e.target as Node);
    }

    private readonly onKeyDown = (e: KeyboardEvent) => {
        if (!this.shouldHandleEvent(e)) {
            return;
        }

        switch (e.code) {
            case KeyCode.F4: {
                console.clear();
                break;
            }

            case KeyCode.F5: {
                console.clear();
                debug("*** RESET ***");
                this.unlinkChildren(this.layout.root);
                this.layout.sync();
                break;
            }

            case KeyCode.arrowLeft:
                this.enterIfInclusion(e, this.caret.position - 1, Direction.left);
                break;

            case KeyCode.arrowRight:
                this.enterIfInclusion(e, this.caret.position, Direction.right);
                break;

            // Note: Chrome 69 delivers backspace on 'keydown' only (i.e., 'keypress' is not fired.)
            case KeyCode.backspace: {
                this.delete(e, Direction.left);
                break;
            }
            case KeyCode.delete: {
                this.delete(e, Direction.right);
                break;
            }
            default: {
                debug("Key: %s (%d)", e.key, e.keyCode);
            }
        }
    };

    private readonly onPaste = (e: ClipboardEvent) => {
        if (!this.shouldHandleEvent(e)) {
            return;
        }

        this.consume(e);
        paste(this.doc, e.clipboardData, this.caret.position);
    };

    private readonly onKeyPress = (e: KeyboardEvent) => {
        if (!this.shouldHandleEvent(e)) {
            return;
        }

        this.consume(e);

        switch (e.code) {
            case KeyCode.enter: {
                if (e.shiftKey) {
                    this.doc.insertLineBreak(this.caret.position);
                } else {
                    this.doc.insertParagraph(this.caret.position);
                }
                break;
            }
            default: {
                this.insertText(e);
            }
        }
    };

    private insertText(e: KeyboardEvent, text = e.key) {
        const { start, end } = this.caret.selection;
        if (start === end) {
            this.doc.insertText(end, text);
        } else {
            this.doc.replaceWithText(start, end, text);
        }
        this.caret.collapseForward();
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
