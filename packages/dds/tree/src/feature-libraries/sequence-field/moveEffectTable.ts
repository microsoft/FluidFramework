/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { MoveMarkEffect } from "./helperTypes.js";
import type { Attach, CellMark, Mark, MarkEffect } from "./types.js";
import { isAttach, isDetach, splitMark } from "./utils.js";
import type { ChangeAtomId } from "../../core/index.js";

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

// TODO: Does this also need to take a CrossFieldTarget?
export type NodeRangeQueryFunc = (id: ChangeAtomId, count: number) => number;

export function splitMarkForMoveEffects(mark: Mark, getLength: NodeRangeQueryFunc): Mark[] {
	const length = getFirstMoveEffectLength(mark, mark.count, getLength);
	return length < mark.count ? splitMark(mark, length) : [mark];
}

function getFirstMoveEffectLength(
	markEffect: MarkEffect,
	count: number,
	getLength: NodeRangeQueryFunc,
): number {
	if (isMoveMark(markEffect)) {
		return getLength({ revision: markEffect.revision, localId: markEffect.id }, count);
	}

	return count;
}
