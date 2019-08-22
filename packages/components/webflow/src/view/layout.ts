/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
// tslint:disable:align
import { IComponent } from "@prague/component-core-interfaces";
import { Dom, Scheduler } from "@prague/flow-util";
import { ISegment, LocalReference, MergeTreeMaintenanceType, TextSegment } from "@prague/merge-tree";
import { SequenceEvent } from "@prague/sequence";
import * as assert from "assert";
import { FlowDocument } from "../document";
import { clamp, done, emptyObject, getSegmentRange } from "../util";
import { extractRef, updateRef } from "../util/localref";
import { debug } from "./debug";
import { Formatter, IFormatterState, RootFormatter } from "./formatter";

interface ILayoutCursor { parent: Node; previous: Node; }

interface IFormatInfo {
    readonly formatter: Readonly<Formatter<IFormatterState>>;
    state: IFormatterState;
}

class LayoutCheckpoint {
    public readonly formatStack: ReadonlyArray<Readonly<IFormatInfo>>;
    public readonly cursor: Readonly<ILayoutCursor>;

    constructor(
        formatStack: ReadonlyArray<IFormatInfo>,
        cursor: Readonly<ILayoutCursor>,
    ) {
        this.formatStack = Object.freeze(formatStack.slice(0));
        this.cursor = Object.freeze({...cursor});
    }
}

// tslint:disable-next-line:no-object-literal-type-assertion
export const eotSegment = { cachedLength: 0 } as ISegment;

export class Layout {
    public get cursor(): Readonly<ILayoutCursor> { return this._cursor; }
    private _cursor: ILayoutCursor;

    private readonly rootFormatInfo: IFormatInfo;

    private get format() {
        const stack = this.formatStack;
        return stack.length > 0
            ? stack[stack.length - 1]
            : this.rootFormatInfo;
    }

    private get slot() { return this.root; }
    private formatStack: Readonly<IFormatInfo>[];
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

    private _segmentStart = NaN;
    public get segmentStart() { return this._segmentStart; }

    private _segmentEnd = NaN;
    public get segmentEnd() { return this._segmentEnd; }

    private startInvalid: LocalReference;
    private endInvalid: LocalReference;

    private readonly scheduleRender: () => void;

    private renderPromise = done;
    private renderResolver: () => void;
    public get rendered() { return this.renderPromise; }

    constructor(public readonly doc: FlowDocument, public readonly root: Element, formatter: Readonly<RootFormatter<IFormatterState>>, scheduler = new Scheduler(), public readonly scope?: IComponent) {
        this.scheduleRender = scheduler.coalesce(scheduler.onTurnEnd, () => { this.render(); });
        this.initialCheckpoint = new LayoutCheckpoint([], { parent: this.slot, previous: null });
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

        if (length === 0) {
            Dom.removeAllChildren(this.root);
            return;
        }

        console.time("Layout.sync()");

        const oldStart = start;
        const oldEnd = end;
        {
            ({ start, end } = (this.rootFormatInfo.formatter as RootFormatter<IFormatterState>).prepare(
                this, clamp(0, start, length), clamp(start, end, length)));

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

            debug("Begin: sync([%d..%d)) -> [%d..%d) len: %d -> %d", oldStart, oldEnd, start, end, oldEnd - oldStart, end - start);
        }

        try {
            doc.visitRange((position, segment, startOffset, endOffset) => {
                this.beginSegment(position, segment, startOffset, endOffset);

                if (position === 0) {
                    const { formatter, state } = this.format;
                    formatter.begin(this, state);
                }

                while (true) {
                    const { formatter, state } = this.format;
                    if (formatter.visit(this, state)) {
                        return this.endSegment(/* lastInvalidated: */ end);
                    }
                }
            }, start);

            // Rendering should progress to the end of the invalidate range, and possibly further.
            assert(start === end || this.segmentEnd >= end);
        } finally {
            // Note: In the case of removal from the end of the document, the invalidated range will be
            //       [length..length).  'visitRange()' above will not enumerate any segments, and therefore
            //       this.segmentEnd will be uninitialized (i.e., NaN).
            //
            //       To handle this case, we include 'end >= length' in the conditional below.
            if (end >= length || this.segmentEnd >= length) {
                debug("Begin EOT: %o@%d (length=%d)", this.segment, this.segmentEnd, doc.length);
                this.beginSegment(length, eotSegment, 0, 0);
                this.popFormat(this.formatStack.length);
                const { formatter, state } = this.format;
                formatter.end(this, state);
                this.endSegment(end);
                debug("End EOT");
            }

            debug("End: sync([%d..%d)) -> [%d..%d) len: %d -> %d",
                oldStart,
                oldEnd,
                start,
                this.position,
                oldEnd - oldStart,
                this.position - start);

            this._cursor = undefined;
            this._segment = undefined;
            this._position = NaN;
            this._endOffset = NaN;
            this._startOffset = NaN;
            this._segmentStart = NaN;
            this._segmentEnd = NaN;

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

    public popFormat(count = 1) {
        while (count-- > 0) {
            const { formatter, state } = this.formatStack.pop();
            debug("  popFormat(%o@%d):", formatter, this.position);
            formatter.end(this, state);
        }
    }

    public pushNode(node: Node) {
        debug("    pushNode(%o@%d)", node, this.position);

        this.emitNode(node);

        {
            const cursor = this._cursor;
            cursor.parent = node;
            cursor.previous = null;
        }
    }

    public emitNode(node: Node) {
        debug("    emitNode(%o@%d)", node, this.position);

        const top = this._cursor;
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

    public popNode(count = 1) {
        while (count-- > 0) {
            const cursor = this._cursor;
            const parent = cursor.parent;
            debug("    popNode(%o@%d):", parent, this.position);
            cursor.previous = parent;
            cursor.parent = parent.parentNode;
        }

        // Must not pop the root node
        assert(this.root.contains(this.cursor.parent));
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
            const cursor = checkpoint.cursor;
            const node = cursor.previous || cursor.parent.firstChild || cursor.parent;
            return { node, nodeOffset: Math.min(offset, node.childNodes.length) };
        }

        return { node: null, nodeOffset: NaN };
    }

    private beginSegment(position: number, segment: ISegment, startOffset: number, endOffset: number) {
        assert.strictEqual(this.pending.size, 0);

        this._position = position;
        this._segment = segment;
        this._startOffset = startOffset;
        this._endOffset = endOffset;

        ({ start: this._segmentStart, end: this._segmentEnd } = getSegmentRange(position, segment, startOffset));

        debug("beginSegment(%o@%d,+%d,-%d): [%d..%d)", segment, this.position, this.startOffset, this.endOffset, this.segmentStart, this.segmentEnd);

        this.emitted = this.pending;
        this.pending = this.segmentToEmitted.get(this._segment) || new Set();
        this.segmentToEmitted.set(this._segment, this.emitted);

        assert.strictEqual(this.emitted.size, 0);
        assert.notStrictEqual(this.emitted, this.pending);
    }

    private removePending() {
        for (const node of this.pending) {
            this.removeNode(node);
        }
        this.pending.clear();
    }

    private endSegment(lastInvalidated: number) {
        this.removePending();
        const previous = this.segmentToCheckpoint.get(this.segment);

        this.segmentToCheckpoint.set(
            this.segment,
            new LayoutCheckpoint(
                this.formatStack,
                this.cursor));

        // Continue synchronizing the DOM if we've not yet reached the last segment in the invalidated range.
        if (!previous || this.segmentEnd < lastInvalidated) {
            return true;
        }

        // Continue synchronizing the DOM if the DOM structure differs than the previous time we've encountered
        // this checkpoint.
        const shouldContinue = this.cursor.parent !== previous.cursor.parent
            || this.cursor.previous !== previous.cursor.previous;

        // Identical structure implies that the node is still attached to the root.
        assert(shouldContinue || this.root.contains(previous.cursor.parent));

        return shouldContinue;
    }

    private restoreCheckpoint(checkpoint: LayoutCheckpoint) {
        const { formatStack, cursor } = checkpoint;
        this.formatStack = formatStack.map((formatInfo) => ({ ...formatInfo }));
        this._cursor     = {...cursor};

        // The next insertion point must be a descendent of the root node.
        assert(this.root.contains(cursor.parent));
    }

    private removeNode(node: Node) {
        debug("        removed %o@%d", node, this.position);
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

    private readonly onChange = (e: SequenceEvent) => {
        debug("onChange(%o)", e);

        (this.rootFormatInfo.formatter as RootFormatter<IFormatterState>).onChange(this, e);

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

        // tslint:disable-next-line:promise-must-complete
        this.renderPromise = new Promise((accept) => { this.renderResolver = accept; });
    }

    private render() {
        const doc = this.doc;
        const start = extractRef(doc, this.startInvalid);
        this.startInvalid = undefined;

        const end = extractRef(doc, this.endInvalid);
        this.endInvalid = undefined;

        this.sync(start, end);
        this.renderResolver();
    }
}
