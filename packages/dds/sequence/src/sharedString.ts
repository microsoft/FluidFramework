/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	IChannelAttributes,
	IFluidDataStoreRuntime,
} from "@fluidframework/datastore-definitions/internal";
import {
	// eslint-disable-next-line import/no-deprecated
	IMergeTreeTextHelper,
	IRelativePosition,
	ISegment,
	ISegmentAction,
	Marker,
	PropertySet,
	ReferenceType,
	TextSegment,
	refHasTileLabel,
} from "@fluidframework/merge-tree/internal";

// eslint-disable-next-line import/no-deprecated
import { SharedSegmentSequence, type ISharedSegmentSequence } from "./sequence.js";
import { SharedStringFactory } from "./sequenceFactory.js";

/**
 * Fluid object interface describing access methods on a SharedString
 * @legacy
 * @alpha
 */
export interface ISharedString extends ISharedSegmentSequence<SharedStringSegment> {
	/**
	 * Inserts the text at the position.
	 * @param pos - The position to insert the text at
	 * @param text - The text to insert
	 * @param props - The properties of the text
	 */
	insertText(pos: number, text: string, props?: PropertySet): void;

	/**
	 * Inserts a marker at the position.
	 * @param pos - The position to insert the marker at
	 * @param refType - The reference type of the marker
	 * @param props - The properties of the marker
	 */
	insertMarker(pos: number, refType: ReferenceType, props?: PropertySet): void;

	/**
	 * Inserts a marker at a relative position.
	 * @param relativePos1 - The relative position to insert the marker at
	 * @param refType - The reference type of the marker
	 * @param props - The properties of the marker
	 */
	insertMarkerRelative(
		relativePos1: IRelativePosition,
		refType: ReferenceType,
		props?: PropertySet,
	): void;

	/**
	 * Inserts the text at the position.
	 * @param relativePos1 - The relative position to insert the text at
	 * @param text - The text to insert
	 * @param props - The properties of text
	 */
	insertTextRelative(relativePos1: IRelativePosition, text: string, props?: PropertySet): void;

	/**
	 * Replaces a range with the provided text.
	 * @param start - The inclusive start of the range to replace
	 * @param end - The exclusive end of the range to replace
	 * @param text - The text to replace the range with
	 * @param props - Optional. The properties of the replacement text
	 */
	replaceText(start: number, end: number, text: string, props?: PropertySet): void;

	/**
	 * Removes the text in the given range.
	 * @param start - The inclusive start of the range to remove
	 * @param end - The exclusive end of the range to replace
	 * @returns the message sent.
	 */
	removeText(start: number, end: number): void;

	/**
	 * Annotates the marker with the provided properties.
	 * @param marker - The marker to annotate
	 * @param props - The properties to annotate the marker with
	 */
	annotateMarker(marker: Marker, props: PropertySet): void;

	/**
	 * Searches a string for the nearest marker in either direction to a given start position.
	 * The search will include the start position, so markers at the start position are valid
	 * results of the search.
	 * @param startPos - Position at which to start the search
	 * @param markerLabel - Label of the marker to search for
	 * @param forwards - Whether the desired marker comes before (false) or after (true) `startPos`. Default true.
	 */
	searchForMarker(
		startPos: number,
		markerLabel: string,
		forwards?: boolean,
	): Marker | undefined;

	/**
	 * Retrieve text from the SharedString in string format.
	 * @param start - The starting index of the text to retrieve, or 0 if omitted.
	 * @param end - The ending index of the text to retrieve, or the end of the string if omitted
	 * @returns The requested text content as a string.
	 */
	getText(start?: number, end?: number): string;

	/**
	 * Adds spaces for markers and handles, so that position calculations account for them.
	 */
	getTextWithPlaceholders(start?: number, end?: number): string;

	getTextRangeWithMarkers(start: number, end: number): string;

	/**
	 * Looks up and returns a `Marker` using its id. Returns `undefined` if there is no marker with the provided
	 * id in this `SharedString`.
	 */
	getMarkerFromId(id: string): ISegment | undefined;
}

/**
 * @legacy
 * @alpha
 */
export type SharedStringSegment = TextSegment | Marker;

/**
 * The Shared String is a specialized data structure for handling collaborative
 * text. It is based on a more general Sequence data structure but has
 * additional features that make working with text easier.
 *
 * In addition to text, a Shared String can also contain markers. Markers can be
 * used to store metadata at positions within the text, like the details of an
 * image or Fluid object that should be rendered with the text.
 * @internal
 */
export class SharedStringClass
	// eslint-disable-next-line import/no-deprecated
	extends SharedSegmentSequence<SharedStringSegment>
	implements ISharedString
{
	public get ISharedString(): ISharedString {
		return this;
	}

	// eslint-disable-next-line import/no-deprecated
	private readonly mergeTreeTextHelper: IMergeTreeTextHelper;

	constructor(
		document: IFluidDataStoreRuntime,
		public id: string,
		attributes: IChannelAttributes,
	) {
		super(document, id, attributes, SharedStringFactory.segmentFromSpec as any);
		this.mergeTreeTextHelper = this.client.createTextHelper();
	}

	/**
	 * {@inheritDoc ISharedString.insertMarkerRelative}
	 */
	public insertMarkerRelative(
		relativePos1: IRelativePosition,
		refType: ReferenceType,
		props?: PropertySet,
	): void {
		const pos = this.posFromRelativePos(relativePos1);
		this.guardReentrancy(() =>
			this.client.insertSegmentLocal(pos, Marker.make(refType, props)),
		);
	}

	/**
	 * {@inheritDoc ISharedString.insertMarker}
	 */
	public insertMarker(pos: number, refType: ReferenceType, props?: PropertySet): void {
		this.guardReentrancy(() =>
			this.client.insertSegmentLocal(pos, Marker.make(refType, props)),
		);
	}

	/**
	 * {@inheritDoc ISharedString.insertTextRelative}
	 */
	public insertTextRelative(
		relativePos1: IRelativePosition,
		text: string,
		props?: PropertySet,
	): void {
		const pos = this.posFromRelativePos(relativePos1);
		this.guardReentrancy(() =>
			this.client.insertSegmentLocal(pos, TextSegment.make(text, props)),
		);
	}

	/**
	 * {@inheritDoc ISharedString.insertText}
	 */
	public insertText(pos: number, text: string, props?: PropertySet): void {
		this.guardReentrancy(() =>
			this.client.insertSegmentLocal(pos, TextSegment.make(text, props)),
		);
	}

	/**
	 * {@inheritDoc ISharedString.replaceText}
	 */
	public replaceText(start: number, end: number, text: string, props?: PropertySet): void {
		this.replaceRange(start, end, TextSegment.make(text, props));
	}

	/**
	 * {@inheritDoc ISharedString.removeText}
	 */
	public removeText(start: number, end: number): void {
		this.removeRange(start, end);
	}

	/**
	 * {@inheritDoc ISharedString.annotateMarker}
	 */
	public annotateMarker(marker: Marker, props: PropertySet): void {
		this.guardReentrancy(() => this.client.annotateMarker(marker, props));
	}

	/**
	 * {@inheritDoc ISharedString.searchForMarker}
	 */
	public searchForMarker(
		startPos: number,
		markerLabel: string,
		forwards = true,
	): Marker | undefined {
		return this.client.searchForMarker(startPos, markerLabel, forwards);
	}

	/**
	 * {@inheritDoc ISharedString.getText}
	 */
	public getText(start?: number, end?: number) {
		const segmentWindow = this.client.getCollabWindow();
		return this.mergeTreeTextHelper.getText(
			segmentWindow.currentSeq,
			segmentWindow.clientId,
			"",
			start,
			end,
		);
	}

	/**
	 * {@inheritDoc ISharedString.getTextWithPlaceholders}
	 */
	public getTextWithPlaceholders(start?: number, end?: number) {
		const segmentWindow = this.client.getCollabWindow();
		return this.mergeTreeTextHelper.getText(
			segmentWindow.currentSeq,
			segmentWindow.clientId,
			" ",
			start,
			end,
		);
	}

	/**
	 * {@inheritDoc ISharedString.getTextRangeWithMarkers}
	 */
	public getTextRangeWithMarkers(start: number, end: number) {
		const segmentWindow = this.client.getCollabWindow();
		return this.mergeTreeTextHelper.getText(
			segmentWindow.currentSeq,
			segmentWindow.clientId,
			"*",
			start,
			end,
		);
	}

	/**
	 * {@inheritDoc ISharedString.getMarkerFromId}
	 */
	public getMarkerFromId(id: string): ISegment | undefined {
		return this.client.getMarkerFromId(id);
	}

	/**
	 * Revert an op
	 */
	protected rollback(content: any, localOpMetadata: unknown): void {
		if (this.client.rollback !== undefined) {
			this.client.rollback(content, localOpMetadata);
		} else {
			super.rollback(content, localOpMetadata);
		}
	}
}

interface ITextAndMarkerAccumulator {
	parallelText: string[];
	parallelMarkers: Marker[];
	parallelMarkerLabel: string;
	placeholder?: string;
	tagsInProgress: string[];
	textSegment: TextSegment;
}

/**
 * Splits the text into regions ending with markers with the given `label`.
 * @param sharedString - String to retrieve text and markers from
 * @param label - label to split on
 * @returns Two parallel lists of text and markers, split by markers with the provided `label`.
 * For example:
 * ```typescript
 * // Say sharedstring has contents "hello<paragraph marker 1>world<paragraph marker 2>missing".
 * const { parallelText, parallelMarkers } = getTextAndMarkers(sharedString, "paragraph");
 * // parallelText === ["hello", "world"]
 * // parallelMarkers === [<paragraph marker 1 object>, <paragraph marker 2 object>]
 * // Note parallelText does not include "missing".
 * ```
 * @internal
 */
export function getTextAndMarkers(
	sharedString: ISharedString,
	label: string,
	start?: number,
	end?: number,
): {
	parallelText: string[];
	parallelMarkers: Marker[];
} {
	const accum: ITextAndMarkerAccumulator = {
		parallelMarkerLabel: label,
		parallelMarkers: [],
		parallelText: [],
		tagsInProgress: [],
		textSegment: new TextSegment(""),
	};

	sharedString.walkSegments(gatherTextAndMarkers, start, end, accum);
	return { parallelText: accum.parallelText, parallelMarkers: accum.parallelMarkers };
}

const gatherTextAndMarkers: ISegmentAction<ITextAndMarkerAccumulator> = (
	segment: ISegment,
	pos: number,
	refSeq: number,
	clientId: number,
	start: number,
	end: number,
	accumText: ITextAndMarkerAccumulator,
) => {
	const { placeholder, tagsInProgress, textSegment } = accumText;
	if (TextSegment.is(segment)) {
		let beginTags = "";
		let endTags = "";
		// TODO: let clients pass in function to get tag
		const tags = [] as string[];
		const initTags = [] as string[];

		if (segment.properties?.["font-weight"]) {
			tags.push("b");
		}
		if (segment.properties?.["text-decoration"]) {
			tags.push("u");
		}
		const remTags = [] as string[];
		if (tags.length > 0) {
			for (const tag of tags) {
				if (!tagsInProgress.includes(tag)) {
					beginTags += `<${tag}>`;
					initTags.push(tag);
				}
			}
			for (const accumTag of tagsInProgress) {
				if (!tags.includes(accumTag)) {
					endTags += `</${accumTag}>`;
					remTags.push(accumTag);
				}
			}
			for (const initTag of initTags.reverse()) {
				tagsInProgress.push(initTag);
			}
		} else {
			for (const accumTag of tagsInProgress) {
				endTags += `</${accumTag}>`;
				remTags.push(accumTag);
			}
		}
		for (const remTag of remTags) {
			const remdex = tagsInProgress.indexOf(remTag);
			if (remdex >= 0) {
				tagsInProgress.splice(remdex, 1);
			}
		}
		textSegment.text += endTags;
		textSegment.text += beginTags;
		if (start <= 0 && end >= segment.text.length) {
			textSegment.text += segment.text;
		} else {
			const seglen = segment.text.length;
			const _start = start < 0 ? 0 : start;
			const _end = end >= seglen ? undefined : end;
			textSegment.text += segment.text.substring(_start, _end);
		}
	} else {
		if (placeholder && placeholder.length > 0) {
			const placeholderText =
				// eslint-disable-next-line @typescript-eslint/no-base-to-string
				placeholder === "*" ? `\n${segment}` : placeholder.repeat(segment.cachedLength);
			textSegment.text += placeholderText;
		} else {
			const marker = segment as Marker;
			if (refHasTileLabel(marker, accumText.parallelMarkerLabel)) {
				accumText.parallelMarkers.push(marker);
				accumText.parallelText.push(textSegment.text);
				textSegment.text = "";
			}
		}
	}

	return true;
};
