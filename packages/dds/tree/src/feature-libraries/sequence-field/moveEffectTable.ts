/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { MoveMarkEffect } from "./helperTypes.js";
import type { Attach, CellMark, Mark, MarkEffect } from "./types.js";
import { isAttach, isDetach, splitMark } from "./utils.js";

export type MoveMark = CellMark<MoveMarkEffect>;

export function isMoveMark(effect: MarkEffect): effect is MoveMarkEffect {
	return isAttach(effect) || isDetach(effect);
}

export function getAttach(effect: MarkEffect): Attach | undefined {
	switch (effect.type) {
		case "Insert":
			return effect;
		default:
			return undefined;
	}
}

export type NodeRangeQueryFunc = (mark: Mark) => number;

export function splitMarkForMoveEffects(mark: Mark, getLength: NodeRangeQueryFunc): Mark[] {
	const length = getLength(mark);
	return length < mark.count ? splitMark(mark, length) : [mark];
}
