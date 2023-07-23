/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert, unreachableCase } from "@fluidframework/common-utils";
import { RevisionTag } from "../../core";
import { CrossFieldManager, CrossFieldTarget } from "../modular-schema";
import { RangeEntry } from "../../util";
import { Mark, MoveId } from "./format";
import { cloneMark, isMoveMark, splitMark } from "./utils";
import { MoveInMark, MoveOutMark, ReturnFromMark, ReturnToMark } from "./helperTypes";

export type MoveEffectTable<T> = CrossFieldManager<MoveEffect<T>>;

/**
 * Changes to be applied to a move mark.
 */
export interface MoveEffect<T> {
	/**
	 * If defined, this move mark should be replaced by `mark`.
	 */
	mark?: Mark<T>;

	/**
	 * Node changes which should be applied to this mark.
	 * If this mark already has node changes, `modifyAfter` should be composed as later changes.
	 */
	modifyAfter?: T;

	/**
	 * A mark which should be moved to the same position as this mark.
	 */
	movedMark?: Mark<T>;

	/**
	 * Represents the new value for the `isSrcConflicted` or `isDstConflicted` field of this mark.
	 */
	pairedMarkStatus?: PairedMarkUpdate;

	/**
	 * The new value for this mark's `detachedBy` field.
	 */
	detacher?: RevisionTag;
}

export enum MoveEnd {
	Source,
	Dest,
}

export enum PairedMarkUpdate {
	/**
	 * Indicates that the mark's matching mark is now inactive.
	 */
	Deactivated,
	/**
	 * Indicates that the mark's matching mark is now active.
	 */
	Reactivated,
}

export interface MovePartition<TNodeChange> {
	id: MoveId;

	// Undefined means the partition is the same size as the input.
	count?: number;
	replaceWith?: Mark<TNodeChange>[];
	modifyAfter?: TNodeChange;
	/**
	 * When set, updates the mark's paired mark status.
	 */
	pairedMarkStatus?: PairedMarkUpdate;
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
	moveEffects.set(target, revision, id, count, effect, invalidate);
}

export function getMoveEffect<T>(
	moveEffects: MoveEffectTable<T>,
	target: CrossFieldTarget,
	revision: RevisionTag | undefined,
	id: MoveId,
	count: number,
	addDependency: boolean = true,
): RangeEntry<MoveEffect<T>> | undefined {
	return moveEffects.get(target, revision, id, count, addDependency);
}

function applyMoveEffectsToDest<T>(
	mark: MoveInMark | ReturnToMark,
	revision: RevisionTag | undefined,
	effects: MoveEffectTable<T>,
	consumeEffect: boolean,
): Mark<T> {
	const newMark: MoveInMark | ReturnToMark = {
		...mark,
	};

	const statusUpdate = getPairedMarkStatus(
		effects,
		CrossFieldTarget.Destination,
		mark.effect.revision ?? revision,
		mark.effect.id,
		mark.count,
		consumeEffect,
	);
	if (statusUpdate === PairedMarkUpdate.Deactivated) {
		newMark.effect.isSrcConflicted = true;
	} else if (statusUpdate === PairedMarkUpdate.Reactivated) {
		delete newMark.effect.isSrcConflicted;
	}

	return newMark;
}

function applyMoveEffectsToSource<T>(
	mark: MoveOutMark<T> | ReturnFromMark<T>,
	revision: RevisionTag | undefined,
	effects: MoveEffectTable<T>,
	consumeEffect: boolean,
	composeChildren?: (a: T | undefined, b: T | undefined) => T | undefined,
): Mark<T> {
	const markEffect = mark.effect;
	let nodeChange = markEffect.changes;
	const modifyAfter = getModifyAfter(
		effects,
		markEffect.revision ?? revision,
		markEffect.id,
		mark.count,
		consumeEffect,
	);
	if (modifyAfter !== undefined) {
		assert(
			composeChildren !== undefined,
			0x569 /* Must provide a change composer if modifying moves */,
		);
		nodeChange = composeChildren(markEffect.changes, modifyAfter);
	}

	const newMark = cloneMark(mark);
	if (nodeChange !== undefined) {
		newMark.effect.changes = nodeChange;
	} else {
		delete newMark.effect.changes;
	}

	const statusUpdate = getPairedMarkStatus(
		effects,
		CrossFieldTarget.Source,
		markEffect.revision ?? revision,
		markEffect.id,
		mark.count,
		consumeEffect,
	);
	if (statusUpdate !== undefined) {
		assert(
			newMark.effect.type === "ReturnFrom",
			0x56a /* TODO: support updating MoveOut.isSrcConflicted */,
		);
		if (statusUpdate === PairedMarkUpdate.Deactivated) {
			newMark.effect.isDstConflicted = true;
		} else {
			delete newMark.effect.isDstConflicted;
		}
	}

	return newMark;
}

export function applyMoveEffectsToMark<T>(
	mark: Mark<T>,
	revision: RevisionTag | undefined,
	effects: MoveEffectTable<T>,
	consumeEffect: boolean,
	composeChildren?: (a: T | undefined, b: T | undefined) => T | undefined,
): Mark<T>[] {
	if (isMoveMark(mark)) {
		const markEffect = mark.effect;
		const type = markEffect.type;
		switch (type) {
			case "MoveOut":
			case "ReturnFrom": {
				const effect = getMoveEffect(
					effects,
					CrossFieldTarget.Source,
					markEffect.revision ?? revision,
					markEffect.id,
					mark.count,
				);
				if (effect === undefined) {
					return [mark];
				}

				if (effect.start > markEffect.id) {
					const [firstMark, secondMark] = splitMark(mark, effect.start - markEffect.id);
					return [
						firstMark,
						...applyMoveEffectsToMark(
							secondMark,
							revision,
							effects,
							consumeEffect,
							composeChildren,
						),
					];
				}

				const lastEffectId = effect.start + effect.length - 1;
				const lastMarkId = (markEffect.id as number) + mark.count - 1;
				if (lastEffectId < lastMarkId) {
					const [firstMark, secondMark] = splitMark(
						mark as MoveOutMark<T> | ReturnFromMark<T>,
						lastEffectId - markEffect.id + 1,
					);
					return [
						applyMoveEffectsToSource(
							firstMark,
							revision,
							effects,
							consumeEffect,
							composeChildren,
						),
						...applyMoveEffectsToMark(
							secondMark,
							revision,
							effects,
							consumeEffect,
							composeChildren,
						),
					];
				}
				return [
					applyMoveEffectsToSource(
						mark as MoveOutMark<T> | ReturnFromMark<T>,
						revision,
						effects,
						consumeEffect,
						composeChildren,
					),
				];
			}
			case "MoveIn":
			case "ReturnTo": {
				const effect = getMoveEffect(
					effects,
					CrossFieldTarget.Destination,
					markEffect.revision ?? revision,
					markEffect.id,
					mark.count,
				);
				if (effect === undefined) {
					return [mark];
				}

				if (effect.start > markEffect.id) {
					const [firstMark, secondMark] = splitMark(mark, effect.start - markEffect.id);
					return [
						firstMark,
						...applyMoveEffectsToMark(
							secondMark,
							revision,
							effects,
							consumeEffect,
							composeChildren,
						),
					];
				}

				const lastEffectId = effect.start + effect.length - 1;
				const lastMarkId = (markEffect.id as number) + mark.count - 1;
				if (lastEffectId < lastMarkId) {
					const [firstMark, secondMark] = splitMark(
						mark as MoveInMark | ReturnToMark,
						lastEffectId - markEffect.id + 1,
					);
					return [
						applyMoveEffectsToDest(firstMark, revision, effects, consumeEffect),
						...applyMoveEffectsToMark(
							secondMark,
							revision,
							effects,
							consumeEffect,
							composeChildren,
						),
					];
				}
				return [
					applyMoveEffectsToDest(
						mark as MoveInMark | ReturnToMark,
						revision,
						effects,
						consumeEffect,
					),
				];
			}
			default:
				unreachableCase(type);
		}
	}
	return [mark];
}

// It is expected that the range from `id` to `id + count - 1` has the same move effect.
// The call sites to this function are making queries about a mark which has already been split by a `MarkQueue`
// to match the ranges in `moveEffects`.
// TODO: Reduce the duplication between this and other MoveEffect helpers
export function getModifyAfter<T>(
	moveEffects: MoveEffectTable<T>,
	revision: RevisionTag | undefined,
	id: MoveId,
	count: number,
	consumeEffect: boolean = true,
): T | undefined {
	const target = CrossFieldTarget.Source;
	const effect = getMoveEffect(moveEffects, target, revision, id, count);

	if (effect?.value.modifyAfter !== undefined) {
		assert(
			effect.start <= id && effect.start + effect.length >= (id as number) + count,
			0x6ee /* Expected effect to cover entire mark */,
		);
		if (consumeEffect) {
			const newEffect = { ...effect.value };
			delete newEffect.modifyAfter;
			setMoveEffect(moveEffects, target, revision, id, count, newEffect, false);
		}
		return effect.value.modifyAfter;
	}

	return undefined;
}

// It is expected that the range from `id` to `id + count - 1` has the same move effect.
// The call sites to this function are making queries about a mark which has already been split by a `MarkQueue`
// to match the ranges in `moveEffects`.
// TODO: Reduce the duplication between this and other MoveEffect helpers
function getPairedMarkStatus<T>(
	moveEffects: MoveEffectTable<T>,
	target: CrossFieldTarget,
	revision: RevisionTag | undefined,
	id: MoveId,
	count: number,
	consumeEffect: boolean = true,
): PairedMarkUpdate | undefined {
	const effect = getMoveEffect(moveEffects, target, revision, id, count);

	if (effect?.value.pairedMarkStatus !== undefined) {
		assert(
			effect.start <= id && effect.start + effect.length >= (id as number) + count,
			0x6ef /* Expected effect to cover entire mark */,
		);
		if (consumeEffect) {
			const newEffect = { ...effect.value };
			delete newEffect.pairedMarkStatus;
			setMoveEffect(moveEffects, target, revision, id, count, newEffect, false);
		}
		return effect.value.pairedMarkStatus;
	}

	return undefined;
}
