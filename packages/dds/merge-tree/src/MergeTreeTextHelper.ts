/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IIntegerRange } from "./client.js";
import { MergeTree } from "./mergeTree.js";
import { ISegmentLeaf } from "./mergeTreeNodes.js";
// eslint-disable-next-line import/no-deprecated
import { IMergeTreeTextHelper, TextSegment } from "./textSegment.js";

interface ITextAccumulator {
	textSegment: TextSegment;
	placeholder?: string;
	parallelArrays?: boolean;
}

// eslint-disable-next-line import/no-deprecated
export class MergeTreeTextHelper implements IMergeTreeTextHelper {
	constructor(private readonly mergeTree: MergeTree) {}

	public getText(
		refSeq: number,
		clientId: number,
		placeholder = "",
		start?: number,
		end?: number,
	): string {
		const range = this.getValidRange(start, end, refSeq, clientId);

		const accum: ITextAccumulator = { textSegment: new TextSegment(""), placeholder };

		this.mergeTree.mapRange<ITextAccumulator>(
			gatherText,
			refSeq,
			clientId,
			accum,
			range.start,
			range.end,
		);
		return accum.textSegment.text;
	}

	private getValidRange(
		start: number | undefined,
		end: number | undefined,
		refSeq: number,
		clientId: number,
	): IIntegerRange {
		const range: IIntegerRange = {
			end: end ?? this.mergeTree.getLength(refSeq, clientId),
			start: start ?? 0,
		};
		return range;
	}
}

function gatherText(
	segment: ISegmentLeaf,
	pos: number,
	refSeq: number,
	clientId: number,
	start: number,
	end: number,
	{ textSegment, placeholder }: ITextAccumulator,
): boolean {
	if (TextSegment.is(segment)) {
		if (start <= 0 && end >= segment.text.length) {
			textSegment.text += segment.text;
		} else {
			const seglen = segment.text.length;
			const _start = start < 0 ? 0 : start;
			const _end = end >= seglen ? undefined : end;
			textSegment.text += segment.text.slice(_start, _end);
		}
	} else if (placeholder && placeholder.length > 0) {
		const placeholderText =
			// eslint-disable-next-line @typescript-eslint/no-base-to-string
			placeholder === "*" ? `\n${segment}` : placeholder.repeat(segment.cachedLength);
		textSegment.text += placeholderText;
	}

	return true;
}
