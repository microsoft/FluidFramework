/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// eslint-disable-next-line import/no-nodejs-modules
import assert from "assert";
import { EventEmitter } from "events";
import { MergeTreeMaintenanceType } from "@fluidframework/merge-tree";
import {
	SequenceEvent,
	ISegment,
	ReferencePosition,
	LocalReferencePosition,
} from "@fluidframework/sequence";
import { FlowDocument } from "../document/index.js";
import {
	clamp,
	Dom,
	done,
	emptyObject,
	getSegmentRange,
	hasTagName,
	isTextNode,
	TagName,
} from "../util/index.js";
import { extractRef, updateRef } from "../util/localref.js";
import { debug } from "./debug.js";
import { BootstrapFormatter, Formatter, IFormatterState, RootFormatter } from "./formatter.js";

interface ILayoutCursor {
	parent: Node;
	previous: Node;
}

interface IFormatInfo {
	readonly formatter: Readonly<Formatter<IFormatterState>>;
	readonly state: IFormatterState;
}

class LayoutCheckpoint {
	public readonly formatStack: readonly Readonly<IFormatInfo>[];
	public readonly cursor: Readonly<ILayoutCursor>;

	constructor(formatStack: readonly IFormatInfo[], cursor: Readonly<ILayoutCursor>) {
		this.formatStack = Object.freeze(formatStack.slice(0));
		this.cursor = Object.freeze({ ...cursor });
	}
}

export const eotSegment = Object.freeze({ cachedLength: 0 }) as ISegment;

export class Layout extends EventEmitter {
	private get format() {
		const stack = this.formatStack;
		return stack.length > 0 ? stack[stack.length - 1] : this.rootFormatInfo;
	}

	private get slot() {
		return this.root;
	}

	private get next() {
		const cursor = this.cursor;
		const { previous } = cursor;

		return previous ? previous.nextSibling : cursor.parent.lastChild;
	}

	public get cursor(): Readonly<ILayoutCursor> {
		return this._cursor;
	}
	public get position() {
		return this._position;
	}
	public get segment() {
		return this._segment;
	}
	public get startOffset() {
		return this._startOffset;
	}
	public get endOffset() {
		return this._endOffset;
	}
	public get segmentStart() {
		return this._segmentStart;
	}
	public get segmentEnd() {
		return this._segmentEnd;
	}
	public get rendered() {
		return this.renderPromise;
	}
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

	private startInvalid: LocalReferencePosition;
	private endInvalid: LocalReferencePosition;

	private readonly scheduleRender: () => void;

	private renderPromise = done;
	private renderResolver: () => void;

	constructor(
		public readonly doc: FlowDocument,
		public readonly root: Element,
		formatter: Readonly<RootFormatter<IFormatterState>>,
	) {
		super();

		let scheduled = false;
		this.scheduleRender = () => {
			if (scheduled) {
				return;
			}

			Promise.resolve()
				.then(() => {
					scheduled = false;
					this.render();
				})
				.catch(console.error);

			scheduled = true;
		};

		this.initialCheckpoint = new LayoutCheckpoint([], { parent: this.slot, previous: null });
		this.rootFormatInfo = Object.freeze({
			formatter: new BootstrapFormatter(formatter),
			state: emptyObject,
		});

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
		let _start = start;
		let _end = end;

		const doc = this.doc;
		const length = doc.length;

		console.time("Layout.sync()");

		const oldStart = _start;
		const oldEnd = _end;
		{
			const startEndInfo = (
				this.rootFormatInfo.formatter as RootFormatter<IFormatterState>
			).prepare(this, clamp(0, _start, length), clamp(_start, _end, length));
			_start = startEndInfo.start;
			_end = startEndInfo.end;

			let checkpoint = this.initialCheckpoint;

			while (_start > 0) {
				const position = _start - 1;
				const { segment, offset } = doc.getSegmentAndOffset(position);
				const range = getSegmentRange(position, segment, offset);

				// If the segment ends at our start position, we can resume here.
				if (range.end === _start) {
					checkpoint = this.segmentToCheckpoint.get(segment);
					break;
				}

				// Otherwise backtrack to the previous segment
				_start = range.start;
			}

			if (_start === 0) {
				checkpoint = this.initialCheckpoint;
			}

			this.restoreCheckpoint(checkpoint);

			debug(
				"Begin: sync([%d..%d)) -> [%d..%d) len: %d -> %d",
				oldStart,
				oldEnd,
				_start,
				_end,
				oldEnd - oldStart,
				_end - _start,
			);
			this.emit("render", { _start, _end });
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

						this.formatStack[index] = Object.freeze({
							formatter,
							state: Object.freeze(newState),
						});
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

			debug(
				"End: sync([%d..%d)) -> [%d..%d) len: %d -> %d",
				oldStart,
				oldEnd,
				start,
				this.position,
				oldEnd - oldStart,
				this.position - start,
			);

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

	public pushFormat<TState extends IFormatterState>(
		formatter: Readonly<Formatter<TState>>,
		init: Readonly<Partial<TState>>,
	) {
		const depth = this.formatStack.length;

		const segment = this.segment;
		debug(
			"  pushFormat(%o,pos=%d,%s,start=%d,end=%d,depth=%d)",
			formatter,
			this.position,
			// eslint-disable-next-line @typescript-eslint/no-base-to-string
			segment.toString(),
			this.startOffset,
			this.endOffset,
			depth,
		);

		// Must not request a formatter for a removed segment.
		assert.strictEqual(segment.removedSeq, undefined);

		// If we've checkpointed this segment previously, we can potentially reuse our previous state to
		// minimize damage to the DOM.
		//
		// Look in the checkpoint's saved format stack at the depth we are about to push on to the
		// current format stack.
		const checkpoint = this.segmentToCheckpoint.get(segment);
		const stack = checkpoint?.formatStack;
		const candidate = stack?.[this.formatStack.length];

		// If we find the same kind of formatter at the expected depth, pass the previous output state.
		const prevOut = (
			candidate && candidate.formatter === formatter ? candidate.state : undefined
		) as TState;

		const state = formatter.begin(this, init, prevOut);

		this.formatStack.push(Object.freeze({ formatter, state: Object.freeze(state) }));
	}

	public popFormat(count = 1) {
		let _count = count;
		while (_count-- > 0) {
			const { formatter, state } = this.formatStack.pop();
			debug("  popFormat(%o@%d):", formatter, this.position);
			formatter.end(this, state);
		}
	}

	// eslint-disable-next-line @typescript-eslint/ban-types
	public pushTag<T extends {}>(tag: TagName, props?: T) {
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

	// eslint-disable-next-line @typescript-eslint/ban-types
	public emitTag<T extends {}>(tag: TagName, props?: T) {
		const element = this.elementForTag(tag);
		if (props) {
			Object.assign(element, props);
		}
		this.emitNode(element);
		return element;
	}

	public emitText(text: string) {
		// Note: Removing and inserting a new text node has the side-effect of reseting the caret blink.
		//       Because text nodes are always leaves, this is harmless.
		let existing = this.next;
		if (!!existing && isTextNode(existing) && this.nodeToSegment(existing) === this.segment) {
			this.removeNode(existing);
		}
		existing = document.createTextNode(text);
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
		let _count = count;
		while (_count-- > 0) {
			const cursor = this._cursor;
			const parent = cursor.parent;
			debug("    popNode(%o@%d):", parent, this.position);
			cursor.previous = parent;
			cursor.parent = parent.parentNode;
		}

		// Must not pop the root node
		assert(this.root.contains(this.cursor.parent));
	}

	public nodeToSegment(node: Node): ISegment {
		const seg = this.nodeToSegmentMap.get(node);
		return seg && (seg.removedSeq === undefined ? seg : undefined);
	}

	public segmentAndOffsetToNodeAndOffset(segment: ISegment, offset: number) {
		const checkpoint = this.segmentToCheckpoint.get(segment);
		if (!checkpoint) {
			return { node: null, nodeOffset: NaN };
		}

		const result = this.segmentAndOffsetToNodeAndOffsetHelper(checkpoint.cursor, offset);

		if (result) {
			debug(
				"@%d %o:%d -> %o:%d",
				segment === eotSegment ? this.doc.length : this.doc.getPosition(segment) + offset,
				segment,
				offset,
				result.node,
				result.nodeOffset,
			);
			return result;
		}

		debug(
			"@%d %o:%d -> null:NaN",
			segment === eotSegment ? this.doc.length : this.doc.getPosition(segment) + offset,
			segment,
			offset,
		);
		return { node: null, nodeOffset: NaN };
	}

	private segmentAndOffsetToNodeAndOffsetHelper(cursor: ILayoutCursor, offset: number) {
		let _offset = offset;
		let { previous: node } = cursor;

		// If there was no previous node, the cursor is located at the first child of the parent.
		if (!node) {
			const { parent } = cursor;
			return { node: parent, nodeOffset: 0 };
		}

		// If the previous node was a non-text element, place the cursor at the end of the non-text element's content.
		while (node.nodeType !== Node.TEXT_NODE) {
			const { childNodes } = node;
			const { length } = childNodes;

			// We cannot descend any further.
			if (length === 0) {
				return { node, nodeOffset: 0 };
			}

			// Coerce NaN to last child
			node = node.childNodes[childNodes.length - 1];

			// If we've found a text node, set the offset to the just after the end of the text.
			if (node.nodeType === Node.TEXT_NODE) {
				_offset = node.textContent.length;
			}
		}

		// Coerce NaN to the position after the last character
		{
			const { length } = node.textContent;
			return { node, nodeOffset: _offset < length ? _offset : length };
		}
	}

	private elementForTag(tag: TagName) {
		const existing = this.next;
		// Reuse the existing element if possible, otherwise create a new one.  Note that
		// 'layout.pushNode(..)' will clean up the old node if needed.
		return !!existing &&
			hasTagName(existing, tag) &&
			this.nodeToSegment(existing) === this.segment
			? existing
			: document.createElement(tag);
	}

	private beginSegment(
		position: number,
		segment: ISegment,
		startOffset: number,
		endOffset: number,
	) {
		assert.strictEqual(this.pending.size, 0);

		this._position = position;
		this._segment = segment;
		this._startOffset = startOffset;
		this._endOffset = endOffset;

		({ start: this._segmentStart, end: this._segmentEnd } = getSegmentRange(
			position,
			segment,
			startOffset,
		));

		debug(
			"beginSegment(%o@%d,+%d,-%d): [%d..%d)",
			segment,
			this.position,
			this.startOffset,
			this.endOffset,
			this.segmentStart,
			this.segmentEnd,
		);

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
			new LayoutCheckpoint(this.formatStack, this.cursor),
		);

		// Continue synchronizing the DOM if we've not yet reached the last segment in the invalidated range.
		if (!previous || this.segmentEnd < lastInvalidated) {
			return true;
		}

		// Continue synchronizing the DOM if the DOM structure differs than the previous time we've encountered
		// this checkpoint.
		const shouldContinue =
			this.cursor.parent !== previous.cursor.parent ||
			this.cursor.previous !== previous.cursor.previous;

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

	private unionRef(
		doc: FlowDocument,
		position: number | undefined,
		ref: ReferencePosition | undefined,
		fn: (a: number, b: number) => number,
		limit: number,
	) {
		return fn(
			position === undefined ? limit : position,
			ref === undefined ? limit : doc.localRefToPosition(ref),
		);
	}

	private invalidate(start: number, end: number) {
		let _start = start;
		let _end = end;
		// Union the delta range with the current invalidated range (if any).
		const doc = this.doc;

		_start = this.unionRef(doc, _start, this.startInvalid, Math.min, +Infinity);
		_end = this.unionRef(doc, _end, this.endInvalid, Math.max, -Infinity);
		this.startInvalid = updateRef(doc, this.startInvalid, _start);
		this.endInvalid = updateRef(doc, this.endInvalid, _end);
		this.scheduleRender();

		this.renderPromise = new Promise((resolve) => {
			this.renderResolver = resolve;
		});
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
