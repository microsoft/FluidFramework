/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { CaretEventType, Direction, Dom, getDeltaX, getDeltaY, ICaretEvent, hasTagName, TagName } from "@fluid-example/flow-util-lib";
import { LocalReference } from "@fluidframework/merge-tree";
import { DocSegmentKind, getDocSegmentKind } from "../document";
import { clamp } from "../util";
import { ownsNode } from "../util/event";
import { updateRef } from "../util/localref";

import { eotSegment, Layout } from "../view/layout";
import { debug } from "./debug";
import * as styles from "./index.css";

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

    public constructor(private readonly layout: Layout) {
        this.startRef = this.doc.addLocalRef(0);
        this.endRef = this.doc.addLocalRef(0);

        document.addEventListener("selectionchange", this.onSelectionChange);

        const root = layout.root;
        root.addEventListener("focus", () => { this.sync(); });
        root.addEventListener(CaretEventType.leave, ((e: ICaretEvent) => {
            const detail = e.detail;
            debug("Leaving inclusion: (dx=%d,dy=%d,bounds=%o)", getDeltaX(detail.direction), getDeltaY(detail.direction), detail.caretBounds);
            const node = e.target as Node;
            if (root.contains(node)) {
                let el = node.parentElement;

                while (el && el !== root) {
                    if (el.classList.contains(styles.inclusion)) {
                        e.preventDefault();
                        e.stopPropagation();

                        const segment = this.layout.nodeToSegment(el);
                        let position = this.doc.getPosition(segment);
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
        }) as EventListener);
    }

    public setSelection(start: number, end: number) {
        debug("  Cursor.setSelection(%d,%d):", start, end);
        debug("    start:");
        this.startRef = updateRef(this.doc, this.startRef, start);
        debug("    end:");
        this.endRef = updateRef(this.doc, this.endRef, end);
    }

    public sync() {
        if (!ownsNode(this.layout.root as HTMLElement, document.activeElement)) {
            debug("  Caret.sync() ignored -- Editor not focused.");
            return;
        }

        debug("  Caret.sync()");
        const { node: startNode, nodeOffset: startOffset } = this.positionToNodeOffset(this.startRef);
        const { node: endNode, nodeOffset: endOffset } = this.positionToNodeOffset(this.endRef);

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

    private positionToNodeOffset(ref: LocalReference) {
        let result: { node: Node, nodeOffset: number };

        const position = this.doc.localRefToPosition(ref);
        const { segment: rightSegment, offset: rightOffset } = this.doc.getSegmentAndOffset(position);
        const rightKind = getDocSegmentKind(ref.segment);

        // The position -> { node, offset } mapping places the caret "just before" the content at the given
        // position.  For text nodes, an offset of 0 is "just before" the first character.
        if (position === 0 || rightKind === DocSegmentKind.text) {
            result = this.layout.segmentAndOffsetToNodeAndOffset(rightSegment, rightOffset);
            debug("    positionToNodeOffset(@%d,%d:%d) -> %o",
                position, rightSegment, rightOffset, result);
        } else {
            // For other nodes, the user typical perceives "just before" to be after the preceding segment.
            const { segment: leftSegment, offset: leftOffset } = this.doc.getSegmentAndOffset(position - 1);

            // Text nodes are special in that the DOM allows placing the caret just after the last character.
            const delta = getDocSegmentKind(leftSegment) === DocSegmentKind.text
                ? 1
                : 0;

            result = this.layout.segmentAndOffsetToNodeAndOffset(
                leftSegment,
                leftOffset + delta);

            debug("    positionToNodeOffset(@%d,%o:%d) -> %o",
                position - 1, leftSegment, leftOffset + delta, result);
        }
        return result;
    }

    private nodeOffsetToPosition(node: Node | Element, nodeOffset: number) {
        const segment = this.layout.nodeToSegment(node);
        if (segment === eotSegment) {
            return this.doc.length;
        }
        const kind = getDocSegmentKind(segment);
        const position = this.doc.getPosition(segment) + nodeOffset;

        // If 'node' maps to a paragraph or tags marker, nudge the position forward to place the caret
        // "just before" the paragraph/tag's content.
        //
        // Note that empty paragraph/tag's markers emit a '<br>' tag to force the block to line height.
        // If the 'node' maps to the '<br>' tag, we are already inside the paragraph/tag's content.
        return kind === DocSegmentKind.text || kind === DocSegmentKind.endOfText || hasTagName(node, TagName.br)
            ? position
            : position + 1;
    }
}
