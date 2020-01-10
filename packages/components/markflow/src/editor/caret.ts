/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { CaretEventType, Direction, Dom, getDeltaX, getDeltaY, ICaretEvent } from "@fluid-example/flow-util-lib";
import { LocalReference } from "@microsoft/fluid-merge-tree";
import { clamp } from "../util";
import { updateRef } from "../util/localref";
import { eotSegment, Layout } from "../view/layout";
import { debug as parentDebug } from "./debug";
import * as styles from "./index.css";

const debug = parentDebug.extend("caret");

export class Caret {
    private get doc() { return this.layout.doc; }
    public get position() { return clamp(0, this.doc.localRefToPosition(this.endRef), this.doc.length); }
    public get anchor() { return clamp(0, this.doc.localRefToPosition(this.startRef), this.doc.length); }
    public get bounds() {
        const { focusNode, focusOffset } = window.getSelection();
        return focusNode === null
            ? undefined
            : Dom.getClientRect(focusNode, focusOffset);
    }

    public get selection() {
        const start = this.anchor;
        const end = this.position;

        return start < end
            ? { start, end }
            : { start: end, end: start };
    }
    private startRef: LocalReference;
    private endRef: LocalReference;

    private readonly onCaretLeave = ((e: ICaretEvent) => {
        const detail = e.detail;
        debug("Leaving inclusion: (dx=%d,dy=%d,bounds=%o)",
            getDeltaX(detail.direction),
            getDeltaY(detail.direction),
            detail.caretBounds);
        const root = this.layout.root;
        const node = e.target as Node;
        if (root.contains(node)) {
            let el = node.parentElement;
            while (el && el !== root) {
                if (el.classList.contains(styles.inclusion)) {
                    e.preventDefault();
                    e.stopPropagation();

                    let position = this.nodeOffsetToPosition(el, 0);
                    debug("  inclusion found @%d", position);

                    switch (detail.direction) {
                        case Direction.up:
                        case Direction.left:
                            break;
                        default:
                            position++;
                    }

                    // Defer setting the selection to avoid stealing focus and receiving the pending key event.
                    requestAnimationFrame(() => {
                        (root as HTMLElement).focus();
                        this.setSelection(position, position);
                        this.sync();
                    });
                    break;
                }
                el = el.parentElement;
            }
        }
    }) as EventListener;

    public constructor(private readonly layout: Layout) {
        this.startRef = this.doc.addLocalRef(0);
        this.endRef = this.doc.addLocalRef(0);
        layout.renderCallback = this.sync.bind(this);

        document.addEventListener("selectionchange", this.onSelectionChange);

        const root = layout.root;
        root.addEventListener("focus", this.onFocus);
        root.addEventListener(CaretEventType.leave, this.onCaretLeave);
    }

    public remove() {
        document.removeEventListener("selectionchange", this.onSelectionChange);

        const root = this.layout.root;
        root.removeEventListener("focus", this.onFocus);
        root.removeEventListener(CaretEventType.leave, this.onCaretLeave);
    }

    public setSelection(start: number, end: number) {
        debug("  Cursor.setSelection(%d,%d):", start, end);
        debug("    start:");
        this.startRef = updateRef(this.doc, this.startRef, start);
        debug("    end:");
        this.endRef = updateRef(this.doc, this.endRef, end);
    }

    public sync() {
        debug("  Caret.sync()");
        const { node: startNode, nodeOffset: startOffset } = this.referenceToNodeOffset(this.startRef);
        const { node: endNode, nodeOffset: endOffset } = this.referenceToNodeOffset(this.endRef);

        const selection = window.getSelection();
        const { anchorNode, anchorOffset, focusNode, focusOffset } = selection;

        if (endOffset !== focusOffset || endNode !== focusNode || startOffset !== anchorOffset || startNode !== anchorNode) {
            debug("    caret set: (%o:%d..%o:%d)", startNode, startOffset, endNode, endOffset);
            this.logWindowSelection("was");
            selection.setBaseAndExtent(startNode, startOffset, endNode, endOffset);
            this.logWindowSelection("now");
        } else {
            debug("    caret unchanged: (%o)", window.getSelection());
        }
    }

    public collapseForward() {
        const { end } = this.selection;
        this.setSelection(end, end);
    }

    private logWindowSelection(title: string) {
        const { anchorNode, anchorOffset, focusNode, focusOffset } = window.getSelection();
        debug("          %s: (%o:%d..%o:%d)", title, anchorNode, anchorOffset, focusNode, focusOffset);
    }

    private readonly onSelectionChange = () => {
        const { anchorNode, anchorOffset, focusNode, focusOffset } = window.getSelection();
        debug("Cursor.onSelectionChange(%o:%d..%o:%d)", anchorNode, anchorOffset, focusNode, focusOffset);
        if (!this.layout.root.contains(focusNode)) {
            debug(" (ignored: outside content)");
            return;
        }
        const start = this.nodeOffsetToPosition(anchorNode, anchorOffset);
        const end = this.nodeOffsetToPosition(focusNode, focusOffset);
        this.setSelection(start, end);
    };

    private readonly onFocus = () => {
        this.sync();
    };

    private referenceToNodeOffset(ref: LocalReference) {
        let { segment, offset } = ref;
        if (segment === undefined) {
            segment = eotSegment;
            offset = NaN;
        }
        return this.layout.segmentAndOffsetToNodeAndOffset(segment, offset);
    }

    private nodeOffsetToPosition(node: Node | Element, nodeOffset: number) {
        const { segment, offset } = this.layout.nodeAndOffsetToSegmentAndOffset(node, nodeOffset);
        return segment === eotSegment
            ? this.doc.length
            : this.doc.getPosition(segment) + offset;
    }
}
