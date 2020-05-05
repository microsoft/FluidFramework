/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import * as assert from "assert";
import { Dom, Scheduler } from "@fluid-example/flow-util-lib";
import { IComponent } from "@microsoft/fluid-component-core-interfaces";
import { ISegment, LocalReference, MergeTreeMaintenanceType } from "@microsoft/fluid-merge-tree";
import { SequenceEvent } from "@microsoft/fluid-sequence";
import { Tag } from "../";
import { FlowDocument } from "../document";
import { clamp, emptyObject, getSegmentRange } from "../util";
import { extractRef, updateRef } from "../util/localref";
import { hasTag } from "../util/tag";
import { debug } from "./debug";
import { BootstrapFormatter, Formatter, IFormatterState, RootFormatter } from "./formatter";

export interface ILayoutCursor { parent: Node; previous: Node; }

interface IFormatInfo {
    readonly formatter: Readonly<Formatter<IFormatterState>>;
    readonly state: IFormatterState;
}

class LayoutCheckpoint {
    public readonly formatStack: ReadonlyArray<Readonly<IFormatInfo>>;
    public readonly cursor: Readonly<ILayoutCursor>;

    constructor(
        formatStack: ReadonlyArray<IFormatInfo>,
        cursor: Readonly<ILayoutCursor>,
    ) {
        this.formatStack = Object.freeze(formatStack.slice(0));
        this.cursor = Object.freeze({ ...cursor });
    }
}

export const eotSegment = Object.freeze({ cachedLength: 0 }) as ISegment;

// Invariants:
//   - Each node is emitted on behalf of exactly 1 segment

export class Layout {
    private get format() {
        const stack = this.formatStack;
        return stack.length > 0
            ? stack[stack.length - 1]
            : this.rootFormatInfo;
    }

    private get slot() { return this.root; }

    private get next() {
        const cursor = this.cursor;
        const { previous } = cursor;

        return previous
            ? previous.nextSibling
            : cursor.parent.lastChild;
    }

    public get cursor(): Readonly<ILayoutCursor> { return this._cursor; }
    public get position() { return this._position; }
    public get segment() { return this._segment; }
    public get startOffset() { return this._startOffset; }
    public get endOffset() { return this._endOffset; }
    public get segmentStart() { return this._segmentStart; }
    public get segmentEnd() { return this._segmentEnd; }
    public renderCallback?: (start, end) => void;
    public invalidatedCallback?: (start, end) => void;

    private readonly rootFormatInfo: IFormatInfo;
    private formatStack: Readonly<IFormatInfo>[];
    private emitted: Set<Node>;
    private pending: Set<Node> = new Set();
    private readonly initialCheckpoint: LayoutCheckpoint;
    private readonly segmentToCheckpoint = new WeakMap<ISegment, LayoutCheckpoint>();
    private readonly nodeToSegmentMap = new WeakMap<Node, ISegment>();
    private readonly segmentToEmitted = new WeakMap<ISegment, Set<Node>>();

    private _cursor: ILayoutCursor;
    private _position = NaN;
    private _segment: ISegment;
    private _startOffset = NaN;
    private _endOffset = NaN;
    private _segmentStart = NaN;
    private _segmentEnd = NaN;

    private startInvalid: LocalReference;
    private endInvalid: LocalReference;

    private readonly scheduleRender: () => void;

    constructor(public readonly doc: FlowDocument, public readonly root: Element, formatter: Readonly<RootFormatter<IFormatterState>>, scheduler = new Scheduler(), public readonly scope?: IComponent) {
        this.scheduleRender = scheduler.coalesce(scheduler.onTurnEnd, () => { this.render(); });
        this.initialCheckpoint = new LayoutCheckpoint([], { parent: this.slot, previous: null });
        this.rootFormatInfo = Object.freeze({ formatter: new BootstrapFormatter(formatter), state: emptyObject });

        doc.on("sequenceDelta", this.onChange);
        doc.on("maintenance", this.onChange);

        debug("begin: initial sync");
        this.sync(0, doc.length);
        debug("end: initial sync");
    }

    public remove() {
        this.doc.removeListener("sequenceDelta", this.onChange);
        this.doc.removeListener("maintenance", this.onChange);
        Dom.removeAllChildren(this.root);
    }

    public sync(start = 0, end = this.doc.length) {
        const doc = this.doc;
        const length = doc.length;

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

            if (start === 0) {
                checkpoint = this.initialCheckpoint;
            }

            this.restoreCheckpoint(checkpoint);

            debug("Begin: sync([%d..%d)) -> [%d..%d) len: %d -> %d", oldStart, oldEnd, start, end, oldEnd - oldStart, end - start);
        }

        try {
            doc.visitRange((position, segment, startOffset, endOffset) => {
                this.beginSegment(position, segment, startOffset, endOffset);

                // eslint-disable-next-line no-constant-condition
                while (true) {
                    const index = this.formatStack.length - 1;
                    const formatInfo = this.format;
                    const { formatter, state } = formatInfo;
                    const { consumed, state: newState } = formatter.visit(this, state);

                    if (newState !== state && this.formatStack[index] === formatInfo) {
                        // If the same 'FormatInfo' object is on the stack, it implies the stack wasn't popped.
                        // Sanity check that the FormatInfo frame contains the same contents as before.
                        assert.deepStrictEqual(this.formatStack[index].state, state);
                        assert.deepStrictEqual(this.formatStack[index].formatter, formatter);

                        this.formatStack[index] = Object.freeze({ formatter, state: Object.freeze(newState) });
                    }

                    // If the segment was consumed:
                    //      1.  call 'endSegment()'
                    //      2.  break out of the inner while
                    //      3.  return the value of 'endSegment()' to 'doc.visitRange(...)' to determine
                    //          if we need to continue layout.
                    if (consumed) {
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

            if (this.renderCallback) {
                this.renderCallback(start, end);
            }
        }
    }

    public pushFormat<TState extends IFormatterState>(formatter: Readonly<Formatter<TState>>, init: Readonly<Partial<TState>>) {
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

        // If we find the same kind of formatter at the expected depth, pass the previous output state.
        const prevOut = (
            candidate && candidate.formatter === formatter
                ? candidate.state
                : undefined) as TState;

        const state = formatter.begin(this, init, prevOut);

        this.formatStack.push(Object.freeze({ formatter, state: Object.freeze(state) }));
    }

    public getFormats(segment: ISegment): ReadonlyArray<Readonly<IFormatInfo>> {
        const checkpoint = this.getCheckpoint(segment);
        const stack = checkpoint.formatStack;
        return stack.length > 0
            ? stack
            : [this.rootFormatInfo];
    }

    public popFormat(count = 1) {
        while (count-- > 0) {
            const { formatter, state } = this.formatStack.pop();
            debug("  popFormat(%o@%d):", formatter, this.position);
            formatter.end(this, state);
        }
    }

    public pushTag<T extends {}>(tag: Tag, props?: T) {
        const element = this.elementForTag(tag);
        if (props) {
            Object.assign(element, props);
        }
        this.pushNode(element);
        return element;
    }

    public popTag(count = 1) {
        this.popNode(count);
    }

    public emitTag<T extends {}>(tag: Tag, props?: T) {
        const element = this.elementForTag(tag);
        if (props) {
            Object.assign(element, props);
        }
        this.emitNode(element);
        return element;
    }

    public emitText(text: string) {
        let existing = this.next;
        if (existing && existing.nodeType === Node.TEXT_NODE && this.nodeToSegment(existing) === this.segment) {
            existing.textContent = text;
        } else {
            existing = document.createTextNode(text);
        }
        this.emitNode(existing);
        return existing;
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

    public segmentAndOffsetToNodeAndOffset(segment: ISegment, offset: number) {
        const { cursor } = this.getCheckpoint(segment);
        const formats = this.getFormats(segment);
        const { formatter, state } = formats[formats.length - 1];
        const result = formatter.segmentAndOffsetToNodeAndOffset(this, state, segment, offset, cursor);
        if (result) {
            debug("@%d %o:%d -> %o:%d",
                segment === eotSegment
                    ? this.doc.length
                    : this.doc.getPosition(segment) + offset,
                segment,
                offset,
                result.node,
                result.nodeOffset);
            return result;
        }

        debug("@%d %o:%d -> null:NaN",
            segment === eotSegment
                ? this.doc.length
                : this.doc.getPosition(segment) + offset,
            segment,
            offset);
        return { node: null, nodeOffset: NaN };
    }

    public nodeAndOffsetToSegmentAndOffset(node: Node, nodeOffset: number): { segment: ISegment, offset: number } {
        // Special case for an empty document.
        if (node === this.slot && nodeOffset === 0) {
            const segmentAndOffset = this.doc.getSegmentAndOffset(0);
            return segmentAndOffset.segment === undefined
                ? { segment: eotSegment, offset: NaN }
                : segmentAndOffset;
        }

        const segment = this.nodeToSegment(node);
        const { cursor } = this.getCheckpoint(segment);
        const formats = this.getFormats(segment);
        const { formatter, state } = formats[formats.length - 1];
        const result = formatter.nodeAndOffsetToSegmentAndOffset(this, state, node, nodeOffset, segment, cursor);
        if (result) {
            debug("%o:%d -> @%d %o:%d",
                node,
                nodeOffset,
                result.segment === eotSegment
                    ? this.doc.length
                    : this.doc.getPosition(segment) + result.offset,
                result.segment,
                result.offset);
            return result;
        }

        assert.fail();
        return { segment: undefined, offset: NaN };
    }

    public getCheckpoint(segment: ISegment) {
        if (segment === eotSegment && this.doc.length === 0) {
            return this.initialCheckpoint;
        }
        return this.segmentToCheckpoint.get(segment);
    }

    private nodeToSegment(node: Node): ISegment {
        const seg = this.nodeToSegmentMap.get(node);
        return seg && (seg.removedSeq === undefined ? seg : undefined);
    }

    private elementForTag(tag: Tag) {
        const existing = this.next;
        // Reuse the existing element if possible, otherwise create a new one.  Note that
        // 'layout.pushNode(..)' will clean up the old node if needed.
        return hasTag(existing, tag) && this.nodeToSegment(existing) === this.segment
            ? existing
            : document.createElement(tag);
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

        // TODO: Move the 'this.root.contains()' to the above 'shouldContinue' logic to support formatters
        //       that push multiple nodes?  (In which case parent could be unchained, but still detached).
        //
        //       If so, do we really need the parent/previous comparison?
        assert(shouldContinue || this.root.contains(previous.cursor.parent));

        return shouldContinue;
    }

    private restoreCheckpoint(checkpoint: LayoutCheckpoint) {
        const { formatStack, cursor } = checkpoint;
        this.formatStack = formatStack.map((formatInfo) => ({ ...formatInfo }));
        this._cursor = { ...cursor };

        // The next insertion point must be a descendent of the root node.
        assert(this.root.contains(cursor.parent));
    }

    private removeNode(node: Node) {
        debug("        removed %o", node);
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

        this.invalidate(e.first.position, e.last.position + e.last.segment.cachedLength);
    };

    private unionRef(doc: FlowDocument, position: number | undefined, ref: LocalReference | undefined, fn: (a: number, b: number) => number, limit: number) {
        return fn(
            position === undefined
                ? limit
                : position,
            ref === undefined
                ? limit
                : doc.localRefToPosition(ref),
        );
    }

    private invalidate(start: number, end: number) {
        // Union the delta range with the current invalidated range (if any).
        const doc = this.doc;
        // eslint-disable-next-line @typescript-eslint/unbound-method
        start = this.unionRef(doc, start, this.startInvalid, Math.min, +Infinity);
        // eslint-disable-next-line @typescript-eslint/unbound-method
        end = this.unionRef(doc, end, this.endInvalid, Math.max, -Infinity);
        this.startInvalid = updateRef(doc, this.startInvalid, start);
        this.endInvalid = updateRef(doc, this.endInvalid, end);
        this.scheduleRender();
        if (this.invalidatedCallback) { this.invalidatedCallback(start, end); }
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
