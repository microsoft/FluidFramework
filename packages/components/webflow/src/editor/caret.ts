/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { CaretEventType, Direction, Dom, getDeltaX, getDeltaY, ICaretEvent } from "@prague/flow-util";
import { LocalReference } from "@prague/merge-tree";
import { DocSegmentKind, getDocSegmentKind } from "../document";
import { clamp } from "../util";
import { debug, domRangeToString, windowSelectionToString } from "./debug";
import * as styles from "./index.css";
import { Layout } from "./view/layout";

export class Caret {
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

                // tslint:disable-next-line:no-conditional-assignment
                while (el && el !== root) {
                    if (el.classList.contains(styles.inclusion)) {
                        e.preventDefault();
                        e.stopPropagation();

                        const segment = this.layout.nodeToSegment(el);
                        let position = this.doc.getPosition(segment);
                        debug("  inclusion found @%d", position);

                        switch (detail.direction) {
                            case Direction.up:
                            case Direction.right:
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

    public setSelection(start: number, end: number) {
        debug(`  Cursor.setSelection(${start},${end}):`);
        debug(`    start:`);
        this.startRef = this.updateRef(this.startRef, start);
        debug(`    end:`);
        this.endRef = this.updateRef(this.endRef, end);
    }

    public sync() {
        debug("  Caret.sync()");
        const { node: startNode, nodeOffset: startOffset } = this.positionToNodeOffset(this.startRef);
        const { node: endNode, nodeOffset: endOffset } = this.positionToNodeOffset(this.endRef);

        const selection = window.getSelection();
        const { anchorNode, anchorOffset, focusNode, focusOffset } = selection;
        if (endOffset !== focusOffset || endNode !== focusNode || startOffset !== anchorOffset || startNode !== anchorNode) {
            debug(`    caret set: (${domRangeToString(startNode, startOffset, endNode, endOffset)})`);
            debug(`          was: (${windowSelectionToString()})`);
            selection.setBaseAndExtent(startNode, startOffset, endNode, endOffset);
            debug(`          now: (${windowSelectionToString()})`);
        } else {
            debug(`    caret unchanged: (${windowSelectionToString()})`);
        }
    }

    private readonly onSelectionChange = (e) => {
        debug(`Cursor.onSelectionChange(${windowSelectionToString()})`);
        const { anchorNode, anchorOffset, focusNode, focusOffset } = window.getSelection();
        if (!this.layout.root.contains(focusNode)) {
            debug(` (ignored: outside content)`);
            return;
        }
        const start = this.nodeOffsetToPosition(anchorNode, anchorOffset);
        const end = this.nodeOffsetToPosition(focusNode, focusOffset);
        this.setSelection(start, end);
    }

    private updateRef(ref: LocalReference, position: number) {
        if (isNaN(position)) {
            debug(`      ${position} (ignored)`);
            return ref;
        }

        const doc = this.doc;
        const oldPosition = doc.localRefToPosition(ref);
        if (!(position !== oldPosition)) {
            debug(`      ${position} (unchanged)`);
            return ref;
        }

        debug(`      ${position} (was: ${oldPosition})`);

        doc.removeLocalRef(ref);
        return doc.addLocalRef(position);
    }

    private positionToNodeOffset(ref: LocalReference) {
        const kind = getDocSegmentKind(ref.segment);
        switch (kind) {
            case DocSegmentKind.text:
                return this.layout.segmentAndOffsetToNodeAndOffset(ref.segment, ref.offset);
            default:
                const position = this.doc.localRefToPosition(ref);
                const { segment, offset } = this.doc.getSegmentAndOffset(position - 1);
                switch (getDocSegmentKind(segment)) {
                    case DocSegmentKind.text:
                        return this.layout.segmentAndOffsetToNodeAndOffset(segment, offset + 1);
                    default:
                        return this.layout.segmentAndOffsetToNodeAndOffset(segment, offset);
                }
        }
    }

    private nodeOffsetToPosition(node: Node, nodeOffset: number) {
        const segment = this.layout.nodeToSegment(node);
        const kind = getDocSegmentKind(segment);
        const position = this.doc.getPosition(segment) + nodeOffset;
        return kind === DocSegmentKind.text || kind === DocSegmentKind.endOfText
            ? position
            : position + 1;
    }
}
