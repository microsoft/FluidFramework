/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert, unreachableCase } from "@fluidframework/core-utils";
import { ChangeAtomId, RevisionTag, TaggedChange } from "../../core/index.js";
import { CrossFieldManager, CrossFieldTarget } from "../modular-schema/index.js";
import { RangeQueryResult, brand } from "../../util/index.js";
import { CellMark, Mark, MarkEffect, MoveId, MoveIn, MoveOut } from "./types.js";
import { isAttachAndDetachEffect, splitMark, splitMarkEffect } from "./utils.js";
import { MoveMarkEffect } from "./helperTypes.js";

export type MoveEffectTable<T> = CrossFieldManager<MoveEffect<T>>;

/**
 * Changes to be applied to a move mark.
 */
export interface MoveEffect<T> {
	/**
	 * Node changes which should be applied to this mark.
	 * If this mark already has node changes, `modifyAfter` should be composed as later changes.
	 */
	modifyAfter?: T;

	/**
	 * Only used during rebasing.
	 * An effect from changeset being rebased which should be moved to the same position as this mark.
	 */
	movedEffect?: MarkEffect;

	/**
	 * Rebased changes for a node which has been moved to the position of this mark.
	 */
	rebasedChanges?: T;

	/**
	 * The ID of the new endpoint associated with this mark.
	 */
	endpoint?: ChangeAtomId;
}

interface MoveEffectWithBasis<T> extends MoveEffect<T> {
	/**
	 * The ID for the start of the range this MoveEffect was created for.
	 * This is used, for example, to correctly interpret `MoveEffect.endpoint` field.
	 */
	basis: MoveId;
}

export enum MoveEnd {
	Source,
	Dest,
}

export interface MovePartition<TNodeChange> {
	id: MoveId;

	// Undefined means the partition is the same size as the input.
	count?: number;
	replaceWith?: Mark<TNodeChange>[];
	modifyAfter?: TaggedChange<TNodeChange>;
}

export function setMoveEffect<T>(
	moveEffects: MoveEffectTable<T>,
	target: CrossFieldTarget,
	revision: RevisionTag | undefined,
	id: MoveId,
	count: number,
	effect: MoveEffect<T>,
	invalidate: boolean = true,
) {
	(effect as MoveEffectWithBasis<T>).basis = id;
	moveEffects.set(target, revision, id, count, effect, invalidate);
}

export function getMoveEffect<T>(
	moveEffects: MoveEffectTable<T>,
	target: CrossFieldTarget,
	revision: RevisionTag | undefined,
	id: MoveId,
	count: number,
	addDependency: boolean = true,
): RangeQueryResult<MoveEffect<T>> {
	const result = moveEffects.get(target, revision, id, count, addDependency);
	return result.value !== undefined
		? { ...result, value: adjustMoveEffectBasis(result.value as MoveEffectWithBasis<T>, id) }
		: result;
}

export type MoveMark<T> = CellMark<MoveMarkEffect, T>;

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

function adjustMoveEffectBasis<T>(effect: MoveEffectWithBasis<T>, newBasis: MoveId): MoveEffect<T> {
	if (effect.basis === newBasis) {
		return effect;
	}

	const adjusted = { ...effect, basis: newBasis };
	const basisShift = newBasis - effect.basis;
	assert(basisShift > 0, 0x812 /* Expected basis shift to be positive */);

	if (effect.endpoint !== undefined) {
		adjusted.endpoint = {
			...effect.endpoint,
			localId: brand(effect.endpoint.localId + basisShift),
		};
	}

	if (effect.movedEffect !== undefined) {
		const [_mark1, mark2] = splitMarkEffect(effect.movedEffect, basisShift);
		adjusted.movedEffect = mark2;
	}

	return adjusted;
}

export function splitMarkForMoveEffects<T>(
	mark: Mark<T>,
	revision: RevisionTag | undefined,
	effects: MoveEffectTable<T>,
): Mark<T>[] {
	const length = getFirstMoveEffectLength(mark, mark.count, revision, effects);
	return length < mark.count ? splitMark(mark, length) : [mark];
}

function getFirstMoveEffectLength(
	markEffect: MarkEffect,
	count: number,
	revision: RevisionTag | undefined,
	effects: MoveEffectTable<unknown>,
): number {
	if (isMoveMark(markEffect)) {
		return getMoveEffect(
			effects,
			getCrossFieldTargetFromMove(markEffect),
			markEffect.revision ?? revision,
			markEffect.id,
			count,
		).length;
	} else if (isAttachAndDetachEffect(markEffect)) {
		return Math.min(
			getFirstMoveEffectLength(markEffect.attach, count, revision, effects),
			getFirstMoveEffectLength(markEffect.detach, count, revision, effects),
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
