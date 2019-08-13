/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
// tslint:disable:align
import { IComponent } from "@prague/component-core-interfaces";
import { Dom, Scheduler } from "@prague/flow-util";
import { ISegment, LocalReference, MergeTreeMaintenanceType, TextSegment } from "@prague/merge-tree";
import { SequenceDeltaEvent, SequenceMaintenanceEvent } from "@prague/sequence";
import * as assert from "assert";
import { FlowDocument } from "../../document";
import { clamp, emptyObject, getSegmentRange } from "../../util";
import { extractRef, updateRef } from "../../util/localref";
import { debug, nodeToString } from "../debug";
import { Formatter, IFormatterState } from "./formatter";

interface ILayoutCursor { parent: Node; previous: Node; }

interface IFormatInfo {
    formatter: Readonly<Formatter<IFormatterState>>;
    state: IFormatterState;
}

class LayoutCheckpoint {
    public readonly formatStack: ReadonlyArray<Readonly<IFormatInfo>>;
    public readonly cursorStack: ReadonlyArray<Readonly<ILayoutCursor>>;

    constructor(
        formatStack: ReadonlyArray<IFormatInfo>,
        cursorStack: ReadonlyArray<ILayoutCursor>,
    ) {
        this.formatStack = Object.freeze(formatStack.slice(0));
        this.cursorStack = Object.freeze(cursorStack.map((cursor) => Object.freeze({...cursor})));
    }
}

export class Layout {
    public get cursor(): Readonly<ILayoutCursor> { return this.internalCursor; }
    private get internalCursor(): ILayoutCursor { return this.cursorStack[this.cursorStack.length - 1]; }

    private readonly rootFormatInfo: IFormatInfo;

    private get format() {
        const stack = this.formatStack;
        return stack.length > 0
            ? stack[stack.length - 1]
            : this.rootFormatInfo;
    }

    private get slot() { return this.root; }
    private formatStack: Array<Readonly<IFormatInfo>>;
    private cursorStack: ILayoutCursor[];
    private emitted: Set<Node>;
    private pending: Set<Node> = new Set();
    private readonly initialCheckpoint: LayoutCheckpoint;
    private readonly segmentToCheckpoint = new WeakMap<ISegment, LayoutCheckpoint>();
    private readonly nodeToSegmentMap = new WeakMap<Node, ISegment>();
    private readonly segmentToTextMap = new WeakMap<ISegment, Text>();
    private readonly segmentToEmitted = new WeakMap<ISegment, Set<Node>>();

    private _position = NaN;
    public get position() { return this._position; }

    private _segment: ISegment;
    public get segment() { return this._segment; }

    private _startOffset = NaN;
    public get startOffset() { return this._startOffset; }

    private _endOffset = NaN;
    public get endOffset() { return this._endOffset; }

    private startInvalid: LocalReference;
    private endInvalid: LocalReference;

    private readonly scheduleRender: () => void;

    constructor(public readonly doc: FlowDocument, public readonly root: Element, formatter: Readonly<Formatter<IFormatterState>>, scheduler = new Scheduler(), public readonly scope?: IComponent) {
        this.scheduleRender = scheduler.coalesce(scheduler.onTurnEnd, () => { this.render(); });
        this.initialCheckpoint = new LayoutCheckpoint([], [{ parent: this.slot, previous: null }]);
        this.rootFormatInfo = Object.freeze({ formatter, state: emptyObject });

        doc.on("sequenceDelta", this.onChange);
        doc.on("maintenance", this.onChange);

        debug("begin: initial sync");
        this.sync(0, doc.length);
        debug("end: initial sync");
    }

    public remove() {
        this.doc.off("sequenceDelta", this.onChange);
        this.doc.off("maintenance", this.onChange);
        Dom.removeAllChildren(this.root);
    }

    // tslint:disable-next-line:max-func-body-length
    public sync(start = 0, end = this.doc.length) {
        const doc = this.doc;
        const length = doc.length;

        // This works around two issues:
        //   1) If the document shrinks to zero length, the below will early exit w/o
        //      deleting any left over nodes.
        //   2) The first thing a user types will cause a <p> tag to appear, resulting
        //      in the cursor jumping according to margin/padding.
        // ...unfortunately, if the user hits enter on the first line, this appears to
        // have no effect.
        if (length === 0) {
            const empty = "";
            if (this.root.innerHTML !== empty) {
                // tslint:disable-next-line:no-inner-html
                this.root.innerHTML = empty;
            }
            return;
        }

        console.time("Layout.sync()");

        {
            const oldStart = start;
            const oldEnd = end;
            start = clamp(0, start, length);
            end = clamp(start, end, length);

            let checkpoint = this.initialCheckpoint;

            while (start > 0) {
                const position = start - 1;
                const { segment, offset } = doc.getSegmentAndOffset(position);
                const range = getSegmentRange(position, segment, offset);

                // If the segment ends at our start position, we can resume here.
                if (range.end === start) {
                    checkpoint = this.segmentToCheckpoint.get(segment);
                    break;
                }

                // Otherwise backtrack to the previous segment
                start = range.start;
            }

            this.restoreCheckpoint(checkpoint);

            debug("sync([%d..%d)) -> [%d..%d) len: %d -> %d", oldStart, oldEnd, start, end, oldEnd - oldStart, end - start);
        }

        try {
            doc.visitRange((position, segment, startOffset, endOffset) => {
                this._position = position;
                this._segment = segment;
                this._startOffset = startOffset;
                this._endOffset = endOffset;

                this.emitted = this.pending;
                this.pending = this.segmentToEmitted.get(this._segment) || new Set();
                this.segmentToEmitted.set(this._segment, this.emitted);

                assert.strictEqual(this.emitted.size, 0);
                assert.notStrictEqual(this.emitted, this.pending);

                while (true) {
                    const { formatter, state } = this.format;
                    if (formatter.visit(this, state)) {
                        return this.saveCheckpoint(end);
                    }
                }
            }, start);
        } finally {
            this._segment = undefined;
            this._startOffset = NaN;
            this._endOffset = NaN;

            if (this.position >= (length - 1)) {
                this._position = length;
                while (this.formatStack.length > 0) { this.popFormat(); }
            }

            this.removePending();
            this.formatStack.length = 0;
            this.cursorStack.length = 0;

            debug("Complete: sync() -> [%d..%d) len: %d", start, this.position + 1, (this.position + 1) - start);
            this._position = NaN;

            console.timeEnd("Layout.sync()");
        }
    }

    public pushFormat<TState extends IFormatterState>(formatter: Readonly<Formatter<TState>>) {
        const depth = this.formatStack.length;

        const segment = this.segment;
        debug("  pushFormat(%o,pos=%d,%s,start=%d,end=%d,depth=%d)",
            formatter,
            this.position,
            segment.toString(),
            this.startOffset,
            this.endOffset,
            depth);

        // Must not request a formatter for a removed segment.
        assert.strictEqual(segment.removedSeq, undefined);

        // If we've checkpointed this segment previously, we can potentially reuse our previous state to
        // minimize damage to the DOM.
        //
        // Look in the checkpoint's saved format stack at the depth we are about to push on to the
        // current format stack.
        const checkpoint = this.segmentToCheckpoint.get(segment);
        const stack = checkpoint && checkpoint.formatStack;
        const candidate = stack && stack[this.formatStack.length];

        // If we find the same kind of formatter at the expected depth, clone it's state for reuse.
        const state = (
            candidate && candidate.formatter === formatter
                ? {...candidate.state}
                : {}) as TState;
        formatter.begin(this, state);

        this.formatStack.push(Object.freeze({ formatter, state: Object.freeze(state) }));
    }

    public popFormat() {
        const length = this.formatStack.length;
        debug("  popFormat(%o): %d", this.format.formatter, length - 1);
        assert(length > 0);
        const { formatter, state } = this.formatStack.pop();
        formatter.end(this, state);
    }

    public pushNode(node: Node) {
        debug("  pushNode(%s@%d)", nodeToString(node), this.position);

        this.emitNode(node);
        this.cursorStack.push({ parent: node, previous: null });
    }

    public emitNode(node: Node) {
        debug("    emitNode(%s@%d)", nodeToString(node), this.position);

        const top = this.internalCursor;
        const { parent, previous } = top;

        // Move 'node' to the correct position in the DOM, if it's not there already.
        if (node.parentNode !== parent || node.previousSibling !== previous) {
            Dom.insertAfter(parent, node, previous);
        }

        this.emitted.add(node);
        this.pending.delete(node);

        top.previous = node;
        this.nodeToSegmentMap.set(node, this.segment);
    }

    public popNode() {
        debug("  popNode(%s@%d): %d -> %d", nodeToString(this.cursor.parent), this.position, this.cursorStack.length, this.cursorStack.length - 1);
        this.cursorStack.pop();
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

        const checkpoint = this.segmentToCheckpoint.get(segment);
        if (checkpoint) {
            const stack = checkpoint.cursorStack;
            const top = stack[stack.length - 1];
            const node = top.previous || top.parent.firstChild || top.parent;
            return { node, nodeOffset: Math.min(offset, node.childNodes.length) };
        }

        return { node: null, nodeOffset: NaN };
    }

    private removePending() {
        for (const node of this.pending) {
            this.removeNode(node);
        }
        this.pending.clear();
    }

    private saveCheckpoint(end: number) {
        this.removePending();
        const previous = this.segmentToCheckpoint.get(this.segment);

        this.segmentToCheckpoint.set(
            this.segment,
            new LayoutCheckpoint(
                this.formatStack,
                this.cursorStack));

        // Continue synchronizing the DOM if we've not yet reached the last segment in the invalidated range.
        if (!previous || this.position < (end - 1)) {
            return true;
        }

        // Continue synchronizing the DOM if the DOM structure differs than the previous time we've encountered
        // this checkpoint.
        const oldStack = previous.cursorStack;
        const newStack = this.cursorStack;
        return oldStack.length !== newStack.length || !oldStack.every(
            (oldCursor, index) => {
                const newCursor = this.cursorStack[index];
                return oldCursor.previous === newCursor.previous && oldCursor.parent === newCursor.parent;
            });
    }

    private restoreCheckpoint(checkpoint: LayoutCheckpoint) {
        const { formatStack, cursorStack } = checkpoint;
        this.formatStack = formatStack.map((formatInfo) => ({ ...formatInfo }));
        this.cursorStack = cursorStack.map((cursor) => ({...cursor}));
    }

    private removeNode(node: Node) {
        debug("        removed %s@%d", nodeToString(node), this.position);
        this.nodeToSegmentMap.delete(node);
        if (node.parentNode) {
            node.parentNode.removeChild(node);
        }
    }

    private removeSegment(segment: ISegment) {
        const emitted = this.segmentToEmitted.get(segment);
        if (emitted) {
            for (const node of emitted) {
                this.removeNode(node);
            }
            this.segmentToEmitted.delete(segment);
        }

        this.segmentToCheckpoint.delete(segment);
        this.segmentToTextMap.delete(segment);
    }

    private readonly onChange = (e: SequenceDeltaEvent | SequenceMaintenanceEvent) => {
        // If the segment was removed, promptly remove any DOM nodes it emitted.
        for (const { segment } of e.ranges) {
            if (segment.removedSeq) {
                this.removeSegment(segment);
            }
        }

        // If segments were appended, promptly remove the right hand side.
        if (e.deltaOperation === MergeTreeMaintenanceType.APPEND) {
            this.removeSegment(e.deltaArgs.deltaSegments[1].segment);
        }

        this.invalidate(e.start, e.end);
    }

    private unionRef(doc: FlowDocument, position: number | undefined, ref: LocalReference | undefined, fn: (a: number, b: number) => number, limit: number) {
        return updateRef(doc, ref, fn(
            position === undefined
                ? limit
                : position,
            ref === undefined
                ? limit
                : doc.localRefToPosition(ref),
        ));
    }

    private invalidate(start: number, end: number) {
        // Union the delta range with the current invalidated range (if any).
        const doc = this.doc;
        this.startInvalid = this.unionRef(doc, start, this.startInvalid, Math.min, +Infinity);
        this.endInvalid   = this.unionRef(doc, end,   this.endInvalid,   Math.max, -Infinity);
        this.scheduleRender();
    }

    private render() {
        const doc = this.doc;
        const start = extractRef(doc, this.startInvalid);
        this.startInvalid = undefined;

        const end = extractRef(doc, this.endInvalid);
        this.endInvalid = undefined;

        this.sync(start, end);
    }
}
