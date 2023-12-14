/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	IMergeTreeTextHelper,
	IRelativePosition,
	ISegment,
	ISegmentAction,
	Marker,
	PropertySet,
	ReferencePosition,
	ReferenceType,
	refHasTileLabel,
	TextSegment,
} from "@fluidframework/merge-tree";
import { IFluidDataStoreRuntime, IChannelAttributes } from "@fluidframework/datastore-definitions";
import { SharedSegmentSequence } from "./sequence";
import { SharedStringFactory } from "./sequenceFactory";

/**
 * Fluid object interface describing access methods on a SharedString
 * @alpha
 */
export interface ISharedString extends SharedSegmentSequence<SharedStringSegment> {
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
	 * {@inheritDoc SharedSegmentSequence.posFromRelativePos}
	 */
	posFromRelativePos(relativePos: IRelativePosition): number;
}

/**
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
 * @alpha
 */
export class SharedString
	extends SharedSegmentSequence<SharedStringSegment>
	implements ISharedString
{
	/**
	 * Create a new shared string.
	 * @param runtime - data store runtime the new shared string belongs to
	 * @param id - optional name of the shared string
	 * @returns newly create shared string (but not attached yet)
	 */
	public static create(runtime: IFluidDataStoreRuntime, id?: string) {
		return runtime.createChannel(id, SharedStringFactory.Type) as SharedString;
	}

	/**
	 * Get a factory for SharedString to register with the data store.
	 * @returns a factory that creates and load SharedString
	 */
	public static getFactory() {
		return new SharedStringFactory();
	}

	public get ISharedString(): ISharedString {
		return this;
	}

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
	 * Inserts a marker at a relative position.
	 * @param relativePos1 - The relative position to insert the marker at
	 * @param refType - The reference type of the marker
	 * @param props - The properties of the marker
	 */
	public insertMarkerRelative(
		relativePos1: IRelativePosition,
		refType: ReferenceType,
		props?: PropertySet,
	): void {
		const segment = new Marker(refType);
		if (props) {
			segment.addProperties(props);
		}

		const pos = this.posFromRelativePos(relativePos1);
		this.guardReentrancy(() => this.client.insertSegmentLocal(pos, segment));
	}

	/**
	 * {@inheritDoc ISharedString.insertMarker}
	 */
	public insertMarker(pos: number, refType: ReferenceType, props?: PropertySet): void {
		const segment = new Marker(refType);
		if (props) {
			segment.addProperties(props);
		}

		this.guardReentrancy(() => this.client.insertSegmentLocal(pos, segment));
	}

	/**
	 * Inserts the text at the position.
	 * @param relativePos1 - The relative position to insert the text at
	 * @param text - The text to insert
	 * @param props - The properties of text
	 */
	public insertTextRelative(
		relativePos1: IRelativePosition,
		text: string,
		props?: PropertySet,
	): void {
		const segment = new TextSegment(text);
		if (props) {
			segment.addProperties(props);
		}

		const pos = this.posFromRelativePos(relativePos1);
		this.guardReentrancy(() => this.client.insertSegmentLocal(pos, segment));
	}

	/**
	 * {@inheritDoc ISharedString.insertText}
	 */
	public insertText(pos: number, text: string, props?: PropertySet): void {
		const segment = new TextSegment(text);
		if (props) {
			segment.addProperties(props);
		}

		this.guardReentrancy(() => this.client.insertSegmentLocal(pos, segment));
	}

	/**
	 * Replaces a range with the provided text.
	 * @param start - The inclusive start of the range to replace
	 * @param end - The exclusive end of the range to replace
	 * @param text - The text to replace the range with
	 * @param props - Optional. The properties of the replacement text
	 */
	public replaceText(start: number, end: number, text: string, props?: PropertySet): void {
		this.replaceRange(start, end, TextSegment.make(text, props));
	}

	/**
	 * Removes the text in the given range.
	 * @param start - The inclusive start of the range to remove
	 * @param end - The exclusive end of the range to replace
	 * @returns the message sent.
	 */
	public removeText(start: number, end: number): void {
		this.removeRange(start, end);
	}

	/**
	 * Annotates the marker with the provided properties.
	 * @param marker - The marker to annotate
	 * @param props - The properties to annotate the marker with
	 */
	public annotateMarker(marker: Marker, props: PropertySet) {
		this.guardReentrancy(() => this.client.annotateMarker(marker, props));
	}

	/**
	 * Finds the nearest reference with ReferenceType.Tile to `startPos` in the direction dictated by `tilePrecedesPos`.
	 * Note that Markers receive `ReferenceType.Tile` by default.
	 * @deprecated Use `searchForMarker` instead.
	 * @param startPos - Position at which to start the search
	 * @param clientId - clientId dictating the perspective to search from
	 * @param tileLabel - Label of the tile to search for
	 * @param preceding - Whether the desired tile comes before (true) or after (false) `startPos`
	 */
	public findTile(
		startPos: number | undefined,
		tileLabel: string,
		preceding = true,
	):
		| {
				tile: ReferencePosition;
				pos: number;
		  }
		| undefined {
		return this.client.findTile(startPos ?? 0, tileLabel, preceding);
	}

	/**
	 * Searches a string for the nearest marker in either direction to a given start position.
	 * The search will include the start position, so markers at the start position are valid
	 * results of the search.
	 * @param startPos - Position at which to start the search
	 * @param markerLabel - Label of the marker to search for
	 * @param forwards - Whether the desired marker comes before (false) or after (true) `startPos`
	 */
	public searchForMarker(
		startPos: number,
		markerLabel: string,
		forwards = true,
	): Marker | undefined {
		return this.client.searchForMarker(startPos, markerLabel, forwards);
	}

	/**
	 * Retrieve text from the SharedString in string format.
	 * @param start - The starting index of the text to retrieve, or 0 if omitted.
	 * @param end - The ending index of the text to retrieve, or the end of the string if omitted
	 * @returns The requested text content as a string.
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
	 * Adds spaces for markers and handles, so that position calculations account for them.
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
	 * Looks up and returns a `Marker` using its id. Returns `undefined` if there is no marker with the provided
	 * id in this `SharedString`.
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
	sharedString: SharedString,
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
