/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils";
import { BaseSegment, ISegment } from "./mergeTreeNodes";
import { IJSONSegment } from "./ops";
import { PropertySet } from "./properties";

// Maximum length of text segment to be considered to be merged with other segment.
// Maximum segment length is at least 2x of it (not taking into account initial segment creation).
// The bigger it is, the more expensive it is to break segment into sub-segments (on edits)
// The smaller it is, the more segments we have in snapshots (and in memory) - it's more expensive to load snapshots.
// Small number also makes ReplayTool produce false positives ("same" snapshots have slightly different binary
// representations).  More measurements needs to be done, but it's very likely the right spot is somewhere between
// 1K-2K mark.  That said, we also break segments on newline and there are very few segments that are longer than 256
// because of it.  Must be an even number.
// Exported for test use only.
export const TextSegmentGranularity = 256;

/**
 * @alpha
 */
export interface IJSONTextSegment extends IJSONSegment {
	text: string;
}

/**
 * @alpha
 */
export class TextSegment extends BaseSegment {
	public static readonly type = "TextSegment";
	public readonly type = TextSegment.type;

	public static is(segment: ISegment): segment is TextSegment {
		return segment.type === TextSegment.type;
	}

	public static make(text: string, props?: PropertySet) {
		const seg = new TextSegment(text);
		if (props) {
			seg.addProperties(props);
		}
		return seg;
	}

	public static fromJSONObject(spec: any) {
		if (typeof spec === "string") {
			return new TextSegment(spec);
		} else if (spec && typeof spec === "object" && "text" in spec) {
			const textSpec = spec as IJSONTextSegment;
			return TextSegment.make(textSpec.text, textSpec.props as PropertySet);
		}
		return undefined;
	}

	constructor(public text: string) {
		super();
		this.cachedLength = text.length;
	}

	public toJSONObject(): IJSONTextSegment | string {
		// To reduce snapshot/ops size, we serialize a TextSegment as a plain 'string' if it is
		// not annotated.
		return this.properties ? { text: this.text, props: this.properties } : this.text;
	}

	public clone(start = 0, end?: number) {
		const text = this.text.substring(start, end);
		const b = TextSegment.make(text, this.properties);
		this.cloneInto(b);
		return b;
	}

	public canAppend(segment: ISegment): boolean {
		return (
			!this.text.endsWith("\n") &&
			TextSegment.is(segment) &&
			(this.cachedLength <= TextSegmentGranularity ||
				segment.cachedLength <= TextSegmentGranularity)
		);
	}

	public toString() {
		return this.text;
	}

	public append(segment: ISegment) {
		assert(TextSegment.is(segment), 0x447 /* can only append text segment */);
		super.append(segment);
		this.text += segment.text;
	}

	protected createSplitSegmentAt(pos: number) {
		if (pos > 0) {
			const remainingText = this.text.substring(pos);
			this.text = this.text.substring(0, pos);
			this.cachedLength = this.text.length;
			const leafSegment = new TextSegment(remainingText);
			return leafSegment;
		}
	}
}

/**
 * @deprecated This functionality was not meant to be exported and will be removed in a future release
 * @alpha
 */
export interface IMergeTreeTextHelper {
	getText(
		refSeq: number,
		clientId: number,
		placeholder: string,
		start?: number,
		end?: number,
	): string;
}
