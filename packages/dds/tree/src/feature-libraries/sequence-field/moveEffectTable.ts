/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { unreachableCase } from "@fluidframework/core-utils/internal";

import { CrossFieldTarget } from "../modular-schema/index.js";

import type { MoveMarkEffect } from "./helperTypes.js";
import type { CellMark, Mark, MarkEffect, MoveIn, MoveOut } from "./types.js";
import { isAttachAndDetachEffect, splitMark } from "./utils.js";
import type { ChangeAtomId } from "../../core/index.js";

export type MoveMark = CellMark<MoveMarkEffect>;

export function isMoveMark(effect: MarkEffect): effect is MoveMarkEffect {
	return isMoveOut(effect) || isMoveIn(effect);
}

export function isMoveOut(effect: MarkEffect): effect is MoveOut {
	return effect.type === "MoveOut";
}

export function isMoveIn(effect: MarkEffect): effect is MoveIn {
	return effect.type === "MoveIn";
}

export function getMoveIn(effect: MarkEffect): MoveIn | undefined {
	switch (effect.type) {
		case "MoveIn":
			return effect;
		case "AttachAndDetach":
			return getMoveIn(effect.attach);
		default:
			return undefined;
	}
}

// TODO: Does this also need to take a CrossFieldTarget?
export type NodeRangeQueryFunc = (id: ChangeAtomId, count: number) => number;

export function splitMarkForMoveEffects(mark: Mark, effects: NodeRangeQueryFunc): Mark[] {
	const length = getFirstMoveEffectLength(mark, mark.count, effects);
	return length < mark.count ? splitMark(mark, length) : [mark];
}

function getFirstMoveEffectLength(
	markEffect: MarkEffect,
	count: number,
	effects: NodeRangeQueryFunc,
): number {
	// XXX: Should check for attach or detach instead
	if (isMoveMark(markEffect)) {
		return effects({ revision: markEffect.revision, localId: markEffect.id }, count);
	} else if (isAttachAndDetachEffect(markEffect)) {
		return Math.min(
			getFirstMoveEffectLength(markEffect.attach, count, effects),
			getFirstMoveEffectLength(markEffect.detach, count, effects),
		);
	}

	return count;
}

export function getCrossFieldTargetFromMove(mark: MoveMarkEffect): CrossFieldTarget {
	const type = mark.type;
	switch (type) {
		case "MoveIn":
			return CrossFieldTarget.Destination;
		case "MoveOut":
			return CrossFieldTarget.Source;
		default:
			unreachableCase(type);
	}
}
