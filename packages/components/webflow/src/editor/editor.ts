/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { Direction, getDeltaX, KeyCode } from "@prague/flow-util";
import { SequenceDeltaEvent } from "@prague/sequence";
import { FlowDocument } from "../document";
import { Caret } from "./caret";
import { debug } from "./debug";
import * as styles from "./index.css";
import { Layout } from "./view/layout";

export class Editor {
    private readonly layout: Layout;
    private readonly caret: Caret;
    private get doc() { return this.layout.doc; }

    constructor(doc: FlowDocument, root: HTMLElement) {
        this.layout = new Layout(doc, root);
        this.caret = new Caret(this.layout);

        root.tabIndex = 0;
        root.contentEditable = "true";
        root.addEventListener("keydown", this.onKeyDown);
        root.addEventListener("keypress", this.onKeyPress);

        doc.on("sequenceDelta", this.onChange);

        debug("begin: initial sync");
        this.layout.sync(0, doc.length);
        debug("end: initial sync");
    }

    public dispose() {
        this.doc.off("sequenceDelta", this.onChange);
    }

    public get selection() { return this.caret.selection; }

    private readonly onChange = (e: SequenceDeltaEvent) => {
        this.layout.sync(e.start, e.end);
    }

    private delete(e: Event, direction: Direction) {
        e.preventDefault();
        e.stopPropagation();

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
        caret.sync();
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

        const keyCode = e.code;

        switch (keyCode) {
            case KeyCode.F5: {
                debug(`*** RESET ***`);
                this.unlinkChildren(this.layout.root);
                this.layout.sync();
                this.caret.sync();
                break;
            }

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
                debug(`Key: ${e.key} (${e.keyCode})`);
            }
        }
    }

    private readonly onKeyPress = (e: KeyboardEvent) => {
        if (!this.shouldHandleEvent(e)) {
            return;
        }

        e.stopPropagation();
        e.preventDefault();

        switch (e.code) {
            case KeyCode.enter: {
                const caret = this.caret;
                const position = caret.position;
                if (e.shiftKey) {
                    this.doc.insertLineBreak(position);
                } else {
                    this.doc.insertParagraph(position);
                }
                caret.sync();
                break;
            }
            default: {
                this.insertText(e);
            }
        }
    }

    private insertText(e: KeyboardEvent) {
        const { start, end } = this.caret.selection;
        if (start === end) {
            this.doc.insertText(end, e.key);
        } else {
            this.doc.replaceWithText(Math.min(start, end), Math.max(start, end), e.key);
        }

        this.caret.sync();
    }
}
