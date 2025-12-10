/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ISegment } from "@fluidframework/sequence/legacy";

export class SegmentSpan {
	public get segments(): readonly ISegment[] {
		// eslint-disable-next-line @typescript-eslint/no-unsafe-return
		return this._segments;
	}
	public get startOffset() {
		return this._startOffset;
	}
	public get startPosition() {
		return this.firstPosition + this._startOffset;
	}
	public get endPosition() {
		return this.lastPosition + Math.min(this._endOffset, this.lastSegment.cachedLength);
	}
	public get isEmpty() {
		return isNaN(this.firstPosition);
	}

	public get firstSegment() {
		return this.segments[0];
	}
	public get lastSegment() {
		return this.segments[this.segments.length - 1];
	}

	public get length() {
		return this.endPosition - this.startPosition;
	}

	private firstPosition = NaN;
	private lastPosition = NaN;
	private readonly _segments = [];
	private _endOffset = NaN;
	private _startOffset = NaN;

	constructor(
		position?: number,
		segment?: ISegment,
		startOffset?: number,
		endOffset?: number,
	) {
		if (position !== undefined) {
			this.append(position, segment, startOffset, endOffset);
		}
	}

	public forEach(
		callback: (
			position: number,
			segment: ISegment,
			startOffset: number,
			endOffset: number,
		) => boolean | undefined,
	) {
		let startOffset = this._startOffset;
		let position = this.firstPosition;
		const final = this.endPosition;

		for (const segment of this.segments) {
			if (
				callback(
					position,
					segment,
					startOffset,
					Math.min(segment.cachedLength, final - position),
				) === false
			) {
				return;
			}

			position += segment.cachedLength;
			startOffset = 0;
		}
	}

	public append(position: number, segment: ISegment, startOffset: number, endOffset: number) {
		this._segments.push(segment);
		this.lastPosition = position;
		this._endOffset = endOffset;

		if (this.isEmpty) {
			this.firstPosition = position;

			// Note: The first segment appended to the span may not be the first segment in the iteration,
			//       in which case the startOffset will be negative.
			this._startOffset = Math.max(startOffset, 0);
		}

		console.assert(0 <= this._startOffset && this._startOffset <= segment.cachedLength);
		console.assert(0 <= this.startPosition && this.startPosition <= this.endPosition);
	}

	/**
	 * Given an offset from the beginning of the span, returns the segment that contains the offset
	 * as well as the offset from the segment start.
	 */
	public spanOffsetToSegmentOffset(spanOffset: number) {
		let currentSpanOffset = spanOffset;
		let segment: ISegment;
		let offset = NaN;

		// Note: It is trivial to accelerate this using binary search.  To do so, construct a second
		//       array of cumulative span lengths when pushing each segment in 'append()'.
		this.forEach((position, candidate, startOffset, endOffset) => {
			segment = candidate;
			const len = endOffset - startOffset;

			offset = startOffset + currentSpanOffset;
			if (currentSpanOffset < len) {
				return false;
			}

			currentSpanOffset -= len;
			return true;
		});

		return { segment, offset };
	}
}
