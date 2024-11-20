/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils/internal";

import { BaseSegment, ISegment } from "./mergeTreeNodes.js";
import { IJSONSegment } from "./ops.js";
import type { PropertySet } from "./properties.js";

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
 * @legacy
 * @alpha
 */
export interface IJSONTextSegment extends IJSONSegment {
	text: string;
}

/**
 * @legacy
 * @alpha
 */
export class TextSegment extends BaseSegment {
	public static readonly type = "TextSegment";
	public readonly type = TextSegment.type;

	public static is(segment: ISegment): segment is TextSegment {
		return segment.type === TextSegment.type;
	}

	public static make(text: string, props?: PropertySet): TextSegment {
		return new TextSegment(text, props);
	}

	public static fromJSONObject(spec: string | IJSONSegment): TextSegment | undefined {
		if (typeof spec === "string") {
			return new TextSegment(spec);
		} else if (spec && typeof spec === "object" && "text" in spec) {
			const textSpec = spec as IJSONTextSegment;
			return TextSegment.make(textSpec.text, textSpec.props);
		}
		return undefined;
	}

	constructor(
		public text: string,
		props?: PropertySet,
	) {
		super(props);
		this.cachedLength = text.length;
	}

	public toJSONObject(): IJSONTextSegment | string {
		// To reduce snapshot/ops size, we serialize a TextSegment as a plain 'string' if it is
		// not annotated.
		return this.properties ? { text: this.text, props: { ...this.properties } } : this.text;
	}

	public clone(start = 0, end?: number): TextSegment {
		const text = this.text.slice(start, end);
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

	public toString(): string {
		return this.text;
	}

	public append(segment: ISegment): void {
		assert(TextSegment.is(segment), 0x447 /* can only append text segment */);
		super.append(segment);
		this.text += segment.text;
	}

	protected createSplitSegmentAt(pos: number): TextSegment | undefined {
		if (pos > 0) {
			const remainingText = this.text.slice(Math.max(0, pos));
			this.text = this.text.slice(0, Math.max(0, pos));
			this.cachedLength = this.text.length;
			const leafSegment = new TextSegment(remainingText);
			return leafSegment;
		}
	}
}

/**
 * @internal
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
