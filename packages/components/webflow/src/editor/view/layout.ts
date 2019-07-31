/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
// tslint:disable:align
import { IComponent } from "@prague/component-core-interfaces";
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
    segment: ISegment;
    depth: number;
}

export class Layout {
    public get cursor(): Readonly<ILayoutCursor> { return this.internalCursor; }
    private get internalCursor(): ILayoutCursor { return this.cursorStack[this.cursorStack.length - 1]; }
    private get format() { return this.formatStack[this.formatStack.length - 1]; }

    private get slot() { return this.root; }
    private readonly formatStack: IFormatInfo[];
    private readonly cursorStack: ILayoutCursor[] = [];
    private readonly segmentToFormatStackMap = new WeakMap<ISegment, IFormatInfo[]>();
    private readonly nodeToSegmentMap = new WeakMap<Node, ISegment>();
    private readonly segmentToTextMap = new WeakMap<ISegment, Text>();

    // tslint:disable:variable-name
    private _position = NaN;
    public get position() { return this._position; }

    private _segment: ISegment;
    public get segment() { return this._segment; }

    private _startOffset = NaN;
    public get startOffset() { return this._startOffset; }

    private _endOffset = NaN;
    public get endOffset() { return this._endOffset; }
    // tslint:enable:variable-name

    private startInvalid = +Infinity;
    private endInvalid = -Infinity;
    private readonly scheduleSync: () => void;

    constructor(public readonly doc: FlowDocument, public readonly root: Element, public readonly scope?: IComponent,
        public readonly scheduler = new Scheduler()) {
        this.formatStack = [{ format: new DocumentFormatter(), state: { root }, segment: undefined, depth: -1 }];
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

        // This works around two issues:
        //   1) If the document shrinks to zero length, the below will early exit w/o
        //      deleting any left over nodes.
        //   2) The first thing a user types will cause a <p> tag to appear, resulting
        //      in the cursor jumping according to margin/padding.
        // ...unfortunately, if the user hits enter on the first line, this appears to
        // have no effect.
        if (this.doc.length === 0) {
            const empty = "<p><br></p>";
            if (this.root.innerHTML !== empty) {
                // tslint:disable-next-line:no-inner-html
                this.root.innerHTML = "<p><br></p>";
            }
            return;
        }

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
                const formats = this.segmentToFormatStackMap.get(seg);
                if (formats) {
                    const root = formats[0].state.root;
                    const cursor = this.internalCursor;
                    cursor.parent = root.parentNode;
                    cursor.previous = root.previousSibling;
                    this._position = start;
                    this._segment = seg;
                    this._startOffset = 0;
                    this._endOffset = 0;
                    this.pushFormat(formats[0].format);
                    break;
                }
            }

            debug("sync([%d..%d)) -> [%d..%d)", oldStart, oldEnd, start, end);
        }

        try {
            this.doc.visitRange((position, segment, startOffset, endOffset) => {
                this._position = position;
                this._segment = segment;
                this._startOffset = startOffset;
                this._endOffset = endOffset;

                let consumed: boolean;
                do {
                    const { format, state } = this.format;
                    consumed = format.visit(state, this);
                } while (!consumed);
                return true;
            }, start, end);
        } finally {
            this._position = end;
            this._segment = undefined;
            this._startOffset = NaN;
            this._endOffset = NaN;

            while (this.formatStack.length > 1) { this.popFormat(); }
            this.cursorStack.length = 0;

            this._position = NaN;
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

    public pushFormat<T extends IFormatterState>(format: Formatter<T>) {
        const segment = this.segment;
        debug("  pushFormat(%o,pos=%d,%s,start=%d,end=%d)", format, this.position, segment && segment.toString(), this.startOffset, this.endOffset);
        const formatInfo = this.getEnsuredFormatInfo(format, segment);

        formatInfo.state = {...formatInfo.state};
        format.begin(formatInfo.state as T, this);
        assert(formatInfo.state.root);
        formatInfo.state = Object.freeze(formatInfo.state);

        this.formatStack.push(formatInfo);
    }

    public popFormat() {
        const length = this.formatStack.length;
        debug("  popFormat(%o): %d", this.format.format, length - 1);

        // DocumentFormatter @0 must remain on the stack.
        assert(length > 1);

        const { format, state } = this.formatStack.pop();
        format.end(state, this);
    }

    public pushNode(node: Node) {
        debug("  pushNode(%s@%d)", nodeToString(node), this.position);

        this.emitNode(node);
        this.cursorStack.push({ parent: node, previous: null });
    }

    public emitNode(node: Node) {
        debug("  emitNode(%s@%d)", nodeToString(node), this.position);

        const top = this.internalCursor;
        const { parent, previous } = top;
        this.ensureAfter(parent, node, previous);
        top.previous = node;
        this.nodeToSegmentMap.set(node, this.segment);
    }

    public popNode() {
        debug("  popNode(): %d", this.cursorStack.length - 1);

        // Any remaining children of the node being popped are stale and should be removed.
        const cursor = this.cursor;
        let next = cursor.previous && cursor.previous.nextSibling;
        while (next) {
            const toRemove = next;
            next = next.nextSibling;
            this.remove(toRemove);
        }

        this.cursorStack.pop();

        // Even though we attempted to trim stale nodes when this node was originally emitted,
        // we try again now, having advanced 'this.position' to the start of the last child in
        // this subtree.
        next = cursor.previous && cursor.previous.nextSibling;
        if (next) {
            this.trimAfter(this.cursor.previous && this.cursor.previous.nextSibling);
        }
    }

    public emitText() {
        const segment = this.segment as TextSegment;
        const text = segment.text;
        let node = this.segmentToTextMap.get(segment);
        if (node === undefined) {
            node = document.createTextNode(text);
            this.segmentToTextMap.set(segment, node);
        } else if (node.textContent !== text) {
            node.textContent = text;
        }

        this.emitNode(node);
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

        const stack = this.segmentToFormatStackMap.get(segment);
        if (stack) {
            const node = stack[stack.length - 1].state.root;
            assert.notStrictEqual(node.nodeType, Node.TEXT_NODE);
            return { node, nodeOffset: Math.min(offset, node.childNodes.length) };
        }

        return { node: null, nodeOffset: NaN };
    }

    private ensureAfter(parent: Node, node: Node, previous: Node) {
        // Move 'node' to the correct position in the DOM, if it's not there already.
        if (node.parentNode !== parent || node.previousSibling !== previous) {
            Dom.insertAfter(parent, node, previous);
        }

        this.trimAfter(node);
    }

    private trimAfter(node: Node) {
        // Remove any peers to the right of 'node' that are no longer in the tree, or now appear
        // earlier in the document.
        const position = this.position;
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

        // If we're requesting another formatter for the same segment, increment the depth.
        // If we've moved to a new segment, look at zero.
        const depth = this.format.segment === segment
            ? this.format.depth + 1
            : 0;

        let stack = this.segmentToFormatStackMap.get(segment);
        if (!stack) {
            stack = [];
            this.segmentToFormatStackMap.set(segment, stack);
        }

        let info: IFormatInfo;
        if (stack.length <= depth) {
            info = { format: formatter, state: formatter.createState(), segment, depth };
            stack.push(info);
        } else {
            info = stack[depth];
            if (info.format !== formatter) {
                info.format = formatter;
                info.state = formatter.createState();
                // The formatting structure has changed.  Reparenting is inevitable.  Delete
                // all following formatters for this segment.
                stack.splice(depth + 1, stack.length - depth);
            }
        }

        return info;
    }

    private remove(node: Node) {
        this.nodeToSegmentMap.delete(node);
        node.parentNode.removeChild(node);
    }
}
