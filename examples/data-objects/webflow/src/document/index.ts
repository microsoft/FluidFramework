/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { DataObject, DataObjectFactory } from "@fluidframework/aqueduct/legacy";
import { IEvent, IFluidHandle } from "@fluidframework/core-interfaces";
import { assert } from "@fluidframework/core-utils/legacy";
import {
	createDetachedLocalReferencePosition,
	createRemoveRangeOp,
	// eslint-disable-next-line import/no-internal-modules -- #26905: `merge-tree` internals used in examples
} from "@fluidframework/merge-tree/internal";
import { IMergeTreeRemoveMsg, refGetTileLabels } from "@fluidframework/merge-tree/legacy";
// eslint-disable-next-line import/no-internal-modules -- #26905: `sequence` internals used in examples
import { reservedTileLabelsKey } from "@fluidframework/sequence/internal";
import {
	ISegment,
	LocalReferencePosition,
	Marker,
	MergeTreeDeltaType,
	PropertySet,
	ReferencePosition,
	ReferenceType,
	SequenceDeltaEvent,
	SequenceMaintenanceEvent,
	SharedString,
	SharedStringSegment,
	TextSegment,
} from "@fluidframework/sequence/legacy";

import { documentType } from "../package.js";
import { IHTMLAttributes } from "../util/attr.js";
import { TagName, TokenList, clamp } from "../util/index.js";

import { debug } from "./debug.js";
import { SegmentSpan } from "./segmentspan.js";

export const enum DocSegmentKind {
	text = "text",
	paragraph = "<p>",
	lineBreak = "<br>",
	beginTags = "<t>",
	endTags = "</>",

	// Special case for ReferencePosition to end of document.  (See comments on 'endOfTextSegment').
	endOfText = "eot",
}

const tilesAndRanges = new Set([
	DocSegmentKind.paragraph,
	DocSegmentKind.lineBreak,
	DocSegmentKind.beginTags,
]);

const enum Workaround {
	checkpoint = "*",
}

export const enum DocTile {
	paragraph = DocSegmentKind.paragraph,
	checkpoint = Workaround.checkpoint,
}

export const getDocSegmentKind = (segment: ISegment): DocSegmentKind => {
	// Special case for ReferencePosition to end of document.  (See comments on 'endOfTextSegment').
	if (segment === endOfTextSegment) {
		return DocSegmentKind.endOfText;
	}

	if (TextSegment.is(segment)) {
		return DocSegmentKind.text;
	} else if (Marker.is(segment)) {
		const markerType = segment.refType;
		switch (markerType) {
			case ReferenceType.Tile:
				const kind = refGetTileLabels(segment)[0] as DocSegmentKind;
				assert(tilesAndRanges.has(kind), `Unknown tile/range label.`);

				return kind;
			default:
				return DocSegmentKind.endTags;
		}
	}
};

const empty = Object.freeze({});

export const getCss = (segment: ISegment): Readonly<{ style?: string; classList?: string }> =>
	segment.properties || empty;

type LeafAction = (
	position: number,
	segment: ISegment,
	startOffset: number,
	endOffset: number,
) => boolean;

/**
 * Used by 'FlowDocument.visitRange'.  Uses the otherwise unused 'accum' object to pass the
 * leaf action callback, allowing us to simplify the the callback signature and while (maybe)
 * avoiding unnecessary allocation to wrap the given 'callback'.
 */
const accumAsLeafAction = (
	segment: ISegment,
	position: number,
	refSeq: number,
	clientId: number,
	startOffset: number,
	endOffset: number,
	accum?: LeafAction,
) => accum(position, segment, startOffset, endOffset);

// TODO: We need the ability to create LocalReferences to the end of the document. Our
//       workaround creates a ReferencePosition with an 'undefined' segment that is never
//       inserted into the MergeTree.  We then special case this segment in localRefToPosition,
//       addLocalRef, removeLocalRef, etc.
//
//       Note, we use 'undefined' for our sentinel value to also workaround the case where
//       the user deletes the entire sequence.  (The SlideOnRemove references end up pointing
//       to undefined segments.)
//
//       See: https://github.com/microsoft/FluidFramework/issues/86
const endOfTextReference = createDetachedLocalReferencePosition(undefined);
const endOfTextSegment = endOfTextReference.getSegment() as SharedStringSegment;

export interface IFlowDocumentEvents extends IEvent {
	(
		event: "sequenceDelta",
		listener: (event: SequenceDeltaEvent, target: SharedString) => void,
	);
	(
		event: "maintenance",
		listener: (event: SequenceMaintenanceEvent, target: SharedString) => void,
	);
}

const textId = "text";

/**
 * @internal
 */
export class FlowDocument extends DataObject {
	private static readonly factory = new DataObjectFactory<FlowDocument>(
		documentType,
		FlowDocument,
		[SharedString.getFactory()],
		{},
	);

	public static getFactory() {
		return FlowDocument.factory;
	}

	public get length() {
		return this.sharedString.getLength();
	}

	private static readonly paragraphProperties = Object.freeze({
		[reservedTileLabelsKey]: [DocSegmentKind.paragraph, DocTile.checkpoint],
		tag: TagName.p,
	});
	private static readonly lineBreakProperties = Object.freeze({
		[reservedTileLabelsKey]: [DocSegmentKind.lineBreak, DocTile.checkpoint],
	});

	private sharedString: SharedString;

	protected async initializingFirstTime(props?: any): Promise<void> {
		// For 'findTile(..)', we must enable tracking of left/rightmost tiles:
		Object.assign(this.runtime, { options: { ...(this.runtime.options || {}) } });

		this.sharedString = SharedString.create(this.runtime);
		this.root.set(textId, this.sharedString.handle);
		this.sharedString.on("sequenceDelta", (event, target) => {
			this.emit("sequenceDelta", event, target);
		});
		this.sharedString.on("maintenance", (event, target) => {
			this.emit("maintenance", event, target);
		});
	}

	protected async initializingFromExisting(): Promise<void> {
		// For 'findTile(..)', we must enable tracking of left/rightmost tiles:
		Object.assign(this.runtime, { options: { ...(this.runtime.options || {}) } });

		const handle = this.root.get<IFluidHandle<SharedString>>(textId);
		if (handle === undefined) {
			throw new Error("String not initialized properly");
		}
		this.sharedString = await handle.get();
		this.sharedString.on("sequenceDelta", (event, target) => {
			this.emit("sequenceDelta", event, target);
		});
		this.sharedString.on("maintenance", (event, target) => {
			this.emit("maintenance", event, target);
		});
	}

	public async getComponentFromMarker(marker: Marker) {
		// eslint-disable-next-line @typescript-eslint/no-unsafe-return
		return marker.properties.handle.get();
	}

	public getSegmentAndOffset(position: number) {
		// Special case for ReferencePosition to end of document.  (See comments on 'endOfTextSegment').
		return position === this.length
			? { segment: endOfTextSegment, offset: 0 }
			: this.sharedString.getContainingSegment(position);
	}

	public getPosition(segment: ISegment) {
		// Special case for ReferencePosition to end of document.  (See comments on 'endOfTextSegment').
		return segment === endOfTextSegment ? this.length : this.sharedString.getPosition(segment);
	}

	public addLocalRef(position: number) {
		// Special case for ReferencePosition to end of document.  (See comments on 'endOfTextSegment').
		if (position >= this.length) {
			return endOfTextReference;
		}

		const { segment, offset } = this.getSegmentAndOffset(position);
		const localRef = this.sharedString.createLocalReferencePosition(
			segment,
			offset,
			ReferenceType.SlideOnRemove,
			undefined,
		);

		return localRef;
	}

	public removeLocalRef(localRef: LocalReferencePosition) {
		const segment = localRef.getSegment();

		// Special case for ReferencePosition to end of document.  (See comments on 'endOfTextSegment').
		if (segment !== endOfTextSegment) {
			this.sharedString.removeLocalReferencePosition(localRef);
		}
	}

	public localRefToPosition(localRef: ReferencePosition) {
		// Special case for ReferencePosition to end of document.  (See comments on 'endOfTextSegment').
		if (localRef.getSegment() === endOfTextSegment) {
			return this.length;
		}
		return this.sharedString.localReferencePositionToPosition(localRef);
	}

	public insertText(position: number, text: string) {
		debug(`insertText(${position},"${text}")`);
		this.sharedString.insertText(position, text);
	}

	public replaceWithText(start: number, end: number, text: string) {
		debug(`replaceWithText(${start}, ${end}, "${text}")`);
		this.sharedString.replaceText(start, end, text);
	}

	public remove(start: number, end: number) {
		let _start = start;
		debug(`remove(${_start},${end})`);
		const ops: IMergeTreeRemoveMsg[] = [];

		this.visitRange(
			(position: number, segment: ISegment) => {
				switch (getDocSegmentKind(segment)) {
					case DocSegmentKind.beginTags: {
						// Removing a start tag implicitly removes its matching end tag.
						// Check if the end tag is already included in the range being removed.
						const endTag = this.getEnd(segment as Marker);
						const endPos = this.getPosition(endTag);

						// Note: The end tag must appear after the position of the current start tag.
						console.assert(position < endPos);

						if (!(endPos < end)) {
							// If not, add the end tag removal to the group op.
							debug(`  also remove end tag '</${endTag.properties.tag}>' at ${endPos}.`);
							ops.push(createRemoveRangeOp(endPos, endPos + 1));
						}
						break;
					}
					case DocSegmentKind.endTags: {
						// The end tag should be preserved unless the start tag is also included in
						// the removed range.  Check if range being removed includes the start tag.
						const startTag = this.getStart(segment as Marker);
						const startPos = this.getPosition(startTag);

						// Note: The start tag must appear before the position of the current end tag.
						console.assert(startPos < position);

						if (!(_start <= startPos)) {
							// If not, remove any positions up to, but excluding the current segment
							// and adjust the pending removal range to just after this marker.
							debug(`  exclude end tag '</${segment.properties.tag}>' at ${position}.`);

							// If the preserved end tag is at the beginning of the removal range, no remove op
							// is necessary.  Just skip over it.
							if (_start !== position) {
								ops.push(createRemoveRangeOp(_start, position));
							}
							_start = position + 1;
						}
						break;
					}
					default:
						break;
				}
				return true;
			},
			_start,
			end,
		);

		// If there is a non-empty span remaining, generate its remove op now.
		if (_start !== end) {
			ops.push(createRemoveRangeOp(_start, end));
		}

		// Perform removals in descending order, otherwise earlier deletions will shift the positions
		// of later ops.  Because each effected interval is non-overlapping, a simple sort suffices.
		ops.sort((left, right) => right.pos1 - left.pos1);

		this.sharedString.groupOperation({
			ops,
			type: MergeTreeDeltaType.GROUP,
		});
	}

	public insertParagraph(position: number, tag?: TagName) {
		debug(`insertParagraph(${position})`);
		this.sharedString.insertMarker(
			position,
			ReferenceType.Tile,
			Object.freeze({ ...FlowDocument.paragraphProperties, tag }),
		);
	}

	public insertLineBreak(position: number) {
		debug(`insertLineBreak(${position})`);
		this.sharedString.insertMarker(
			position,
			ReferenceType.Tile,
			FlowDocument.lineBreakProperties,
		);
	}

	public setFormat(position: number, tag: TagName) {
		const { start } = this.findParagraph(position);

		// If inside an existing paragraph marker, update it with the new formatting tag.
		if (start < this.length) {
			const pgSeg = this.getSegmentAndOffset(start).segment;
			if (getDocSegmentKind(pgSeg) === DocSegmentKind.paragraph) {
				pgSeg.properties.tag = tag;
				this.annotate(start, start + 1, { tag });
				return;
			}
		}

		// Otherwise, insert a new paragraph marker.
		this.insertParagraph(start, tag);
	}

	public getStart(marker: Marker) {
		return this.getOppositeMarker(marker, /* "end".length = */ 3, "begin");
	}

	public getEnd(marker: Marker) {
		return this.getOppositeMarker(marker, /* "begin".length = */ 5, "end");
	}

	public annotate(start: number, end: number, props: PropertySet) {
		this.sharedString.annotateRange(start, end, props);
	}

	public setCssStyle(start: number, end: number, style: string) {
		this.sharedString.annotateRange(start, end, { style });
	}

	public addCssClass(start: number, end: number, ...classNames: string[]) {
		if (classNames.length > 0) {
			const newClasses = classNames.join(" ");
			this.updateCssClassList(start, end, (classList) => TokenList.set(classList, newClasses));
		}
	}

	public removeCssClass(start: number, end: number, ...classNames: string[]) {
		this.updateCssClassList(start, end, (classList) =>
			classNames.reduce(
				(updatedList, className) => TokenList.unset(updatedList, className),
				classList,
			),
		);
	}

	public toggleCssClass(start: number, end: number, ...classNames: string[]) {
		// Pre-visit the range to see if any of the new styles have already been set.
		// If so, change the add to a removal by setting the map value to 'undefined'.
		const toAdd = classNames.slice(0);
		const toRemove = new Set<string>();

		this.updateCssClassList(start, end, (classList) => {
			TokenList.computeToggle(classList, toAdd, toRemove);
			return classList;
		});

		this.removeCssClass(start, end, ...toRemove);
		this.addCssClass(start, end, ...toAdd);
	}

	public setAttr(start: number, end: number, attr: IHTMLAttributes) {
		this.sharedString.annotateRange(start, end, { attr });
	}

	public searchForMarker(startPos: number, markerLabel: string, forwards: boolean) {
		return this.sharedString.searchForMarker(startPos, markerLabel, forwards);
	}

	public findParagraph(position: number) {
		const maybeStart = this.searchForMarker(position, DocTile.paragraph, /* forwards: */ true);
		const start = maybeStart
			? this.sharedString.localReferencePositionToPosition(maybeStart)
			: 0;

		const maybeEnd = this.searchForMarker(position, DocTile.paragraph, /* forwards: */ false);
		const end = maybeEnd
			? this.sharedString.localReferencePositionToPosition(maybeEnd) + 1
			: this.length;

		return { start, end };
	}

	public visitRange(callback: LeafAction, start = 0, end = this.length) {
		const _end = clamp(0, end, this.length);
		const _start = clamp(0, start, end);

		// Early exit if passed an empty or invalid range (e.g., NaN).
		if (!(_start < _end)) {
			return;
		}

		// Note: We pass the leaf callback action as the accumulator, and then use the 'accumAsLeafAction'
		//       actions to invoke the accum for each leaf.  (Paranoid micro-optimization that attempts to
		//       avoid allocation while simplifying the 'LeafAction' signature.)
		this.sharedString.walkSegments(accumAsLeafAction, _start, _end, callback);
	}

	public getText(start?: number, end?: number): string {
		return this.sharedString.getText(start, end);
	}

	public toString() {
		const s: string[] = [];
		this.visitRange((position, segment) => {
			let _segment = segment;
			const kind = getDocSegmentKind(_segment);
			switch (kind) {
				case DocSegmentKind.text:
					s.push((_segment as TextSegment).text);
					break;
				case DocSegmentKind.beginTags:
					for (const tag of _segment.properties.tags) {
						s.push(`<${tag}>`);
					}
					break;
				case DocSegmentKind.endTags:
					_segment = this.getStart(_segment as Marker);
					const tags = _segment.properties.tags.slice().reverse();
					for (const tag of tags) {
						s.push(`</${tag}>`);
					}
					break;
				default:
					s.push(kind);
			}
			return true;
		});
		return s.join("");
	}

	private getOppositeMarker(marker: Marker, oldPrefixLength: number, newPrefix: string) {
		return this.sharedString.getMarkerFromId(
			`${newPrefix}${marker.getId().slice(oldPrefixLength)}`,
		);
	}

	private updateCssClassList(
		start: number,
		end: number,
		callback: (classList: string) => string,
	) {
		const updates: { span: SegmentSpan; classList: string }[] = [];

		this.visitRange(
			(position, segment, startOffset, endOffset) => {
				const oldList = getCss(segment).classList;
				const newList = callback(oldList);

				if (newList !== oldList) {
					updates.push({
						classList: newList,
						span: new SegmentSpan(position, segment, startOffset, endOffset),
					});
				}

				return true;
			},
			start,
			end,
		);

		for (const { span, classList } of updates) {
			this.annotate(span.startPosition, span.endPosition, { classList });
		}
	}
}
