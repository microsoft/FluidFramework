/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { Dom, Scheduler } from "@prague/flow-util";
import { ISegment, Marker, ReferenceType, reservedMarkerIdKey, TextSegment } from "@prague/merge-tree";
import * as assert from "assert";
import { DocTile, FlowDocument } from "../../document";
import { clamp } from "../../util";
import { debug, nodeToString } from "../debug";
import { DocumentFormatter } from "./element";
import { Formatter, IFormatterState } from "./formatter";

interface ILayoutCursor { parent: Node; previous: Node; }

interface IFormatInfo {
    format: Formatter<IFormatterState>;
    state: IFormatterState;
}

export class Layout {
    public get cursor(): Readonly<ILayoutCursor> { return this.internalCursor; }
    private get internalCursor(): ILayoutCursor { return this.cursorStack[this.cursorStack.length - 1]; }
    private get format() { return this.formatStack[this.formatStack.length - 1]; }

    private get slot() { return this.root; }
    private readonly formatStack: IFormatInfo[];
    private readonly cursorStack: ILayoutCursor[] = [];
    private readonly segmentToFormatInfoMap = new WeakMap<ISegment, IFormatInfo>();
    private readonly nodeToSegmentMap = new WeakMap<Node, ISegment>();
    private readonly segmentToTextMap = new WeakMap<ISegment, Text>();

    private startInvalid = +Infinity;
    private endInvalid = -Infinity;
    private readonly scheduleSync: () => void;

    constructor(public readonly doc: FlowDocument, public readonly root: Element, public readonly scheduler = new Scheduler()) {
        this.formatStack = [{ format: new DocumentFormatter(), state: { root }}];
        this.scheduleSync = scheduler.coalesce(scheduler.onTurnEnd, () => {
            const start = this.startInvalid;
            const end = this.endInvalid;
            this.startInvalid = +Infinity;
            this.endInvalid = -Infinity;
            this.sync(start, end);
        });
    }

    public invalidate(start: number, end: number) {
        this.startInvalid = Math.min(this.startInvalid, start);
        this.endInvalid = Math.max(this.endInvalid, end);
        debug(`invalidate([${start}..${end})) -> [${this.startInvalid}..${this.endInvalid})`);
        this.scheduleSync();
    }

    public sync(start = 0, end = this.doc.length) {
        console.time("Layout.sync()");

        {
            const oldStart = start;
            const oldEnd = end;
            const doc = this.doc;
            const length = doc.length;
            start = clamp(0, start, length);
            end = clamp(start, end, length);

            this.cursorStack.push({ parent: this.slot, previous: null });

            if (end < this.doc.length) {
                const endPg = doc.findTile(end, DocTile.paragraph, /* preceding: */ false);
                end = endPg ? endPg.pos : doc.length;
            }

            while (start > 0) {
                // Look for a preceding tile
                const tileInfo = doc.findTile(start - 1, DocTile.paragraph, /* preceding: */ true);

                // If there is none, we've hit the beginning of the document.  Start there.
                if (!tileInfo) {
                    start = 0;
                    break;
                }

                // See if we've constructed DOM for this tile.
                start = tileInfo.pos;
                const seg = tileInfo.tile as unknown as ISegment;
                const info = this.segmentToFormatInfoMap.get(seg);
                if (info) {
                    const root = info.state.root;
                    const cursor = this.internalCursor;
                    cursor.parent = root.parentNode;
                    cursor.previous = root.previousSibling;
                    this.pushFormat(info.format, start, seg, 0, 0);
                    break;
                }
            }

            debug("sync([%d..%d)) -> [%d..%d)", oldStart, oldEnd, start, end);
        }

        try {
            this.doc.visitRange((position, segment, startOffset, endOffset) => {
                let consumed: boolean;
                do {
                    const { format, state } = this.format;
                    consumed = format.visit(state, this, position, segment, startOffset, endOffset);
                } while (!consumed);
                return true;
            }, start, end);
        } finally {
            while (this.formatStack.length > 1) { this.popFormat(end, undefined, NaN, NaN); }
            this.cursorStack.length = 0;
        }

        console.timeEnd("Layout.sync()");
    }

    public getTagId(marker: ISegment) {
        if (Marker.is(marker)) {
            switch (marker.refType) {
                case ReferenceType.NestBegin:
                    return marker.properties[reservedMarkerIdKey].slice(6);
                case ReferenceType.NestEnd:
                    return marker.properties[reservedMarkerIdKey].slice(4);
                default:
            }
        }
        return undefined;
    }

    public pushFormat<T extends IFormatterState>(format: Formatter<T>, position: number, segment: ISegment, startOffset: number, endOffset: number) {
        debug("  pushFormat(%s,pos=%d,%s,start=%d,end=%d)", format.constructor.name, position, segment && segment.toString(), startOffset, endOffset);
        const formatInfo = this.getEnsuredFormatInfo(format, segment);

        formatInfo.state = {...formatInfo.state};
        format.begin(formatInfo.state as T, this, position, segment, startOffset, endOffset);
        assert(formatInfo.state.root);
        formatInfo.state = Object.freeze(formatInfo.state);

        this.formatStack.push(formatInfo);
    }

    public popFormat(position: number, segment: ISegment, startOffset: number, endOffset: number) {
        const length = this.formatStack.length;
        debug("  popFormat(): %d", length - 1);

        // DocumentFormatter @0 must remain on the stack.
        assert(length > 1);

        const { format, state } = this.formatStack.pop();
        format.end(state, this, position, segment, startOffset, endOffset);
    }

    public pushNode(node: Node, position: number, segment: ISegment) {
        debug("  pushNode(%o@%d)", nodeToString(node), position);

        this.emitNode(node, position, segment);
        this.cursorStack.push({ parent: node, previous: null });
    }

    public emitNode(node: Node, position: number, segment: ISegment) {
        // debug("  emitNode(%o@%d)", node, position);

        const top = this.internalCursor;
        const { parent, previous } = top;
        this.ensureAfter(position, parent, node, previous);
        top.previous = node;
        this.nodeToSegmentMap.set(node, segment);
    }

    public popNode() {
        debug("  popNode(): %d", this.cursorStack.length - 1);

        const cursor = this.cursor;
        let next = cursor.previous && cursor.previous.nextSibling;
        while (next) {
            const toRemove = next;
            next = next.nextSibling;
            this.remove(toRemove);
        }

        this.cursorStack.pop();
    }

    public emitText(position: number, segment: TextSegment) {
        // debug("  emitNode(%o@%d)", segment.text, position);

        const text = segment.text;
        let node = this.segmentToTextMap.get(segment);
        if (node === undefined) {
            node = document.createTextNode(text);
            this.segmentToTextMap.set(segment, node);
        } else if (node.textContent !== text) {
            node.textContent = text;
        }

        this.emitNode(node, position, segment);
    }

    public nodeToSegment(node: Node): ISegment {
        const seg = this.nodeToSegmentMap.get(node);
        return seg && (seg.removedSeq === undefined ? seg : undefined);
    }

    public segmentAndOffsetToNodeAndOffset(segment: ISegment, offset: number) {
        {
            const node: Text = this.segmentToTextMap.get(segment);
            if (node) {
                return { node, nodeOffset: Math.min(offset, node.textContent.length) };
            }
        }

        const format = this.segmentToFormatInfoMap.get(segment);
        if (format) {
            const node = format.state.root;
            assert.notStrictEqual(node.nodeType, Node.TEXT_NODE);
            return { node, nodeOffset: Math.min(offset, node.childNodes.length) };
        }

        return { node: null, nodeOffset: NaN };
    }

    private ensureAfter(position: number, parent: Node, node: Node, previous: Node) {
        // Move 'node' to the correct position in the DOM, if it's not there already.
        if (node.parentNode !== parent || node.previousSibling !== previous) {
            Dom.insertAfter(parent, node, previous);
        }

        this.trim(position, node);
    }

    private trim(position: number, node: Node) {
        // Remove any peers to the right of 'node' that are no longer in the tree, or now appear
        // earlier in the document.
        for (let next = node.nextSibling; next !== null; next = node.nextSibling) {
            const seg = this.nodeToSegment(next);
            if (seg && (this.doc.getPosition(seg) > position)) {
                break;
            }
            this.remove(next);
        }
    }

    private getEnsuredFormatInfo<T>(formatter: Formatter<T>, segment: ISegment) {
        assert.strictEqual(segment.removedSeq, undefined);
        let formatInfo = this.segmentToFormatInfoMap.get(segment);
        if (!formatInfo) {
            formatInfo = { format: formatter, state: formatter.createState() };
            this.segmentToFormatInfoMap.set(segment, formatInfo);
        }
        assert.strictEqual(formatInfo.format, formatter);
        return formatInfo;
    }

    private remove(node: Node) {
        this.nodeToSegmentMap.delete(node);
        node.parentNode.removeChild(node);
    }
}
