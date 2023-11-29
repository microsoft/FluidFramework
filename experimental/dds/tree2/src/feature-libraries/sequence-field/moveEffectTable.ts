/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert, unreachableCase } from "@fluidframework/core-utils";
import { ChangeAtomId, RevisionTag } from "../../core";
import { CrossFieldManager, CrossFieldTarget } from "../modular-schema";
import { RangeQueryResult, brand } from "../../util";
import { CellMark, Mark, MarkEffect, MoveId, MoveIn, MoveOut } from "./format";
import { areEqualCellIds, cloneMark, isAttachAndDetachEffect, splitMark } from "./utils";
import { MoveMarkEffect } from "./helperTypes";

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
	 * A mark which should be moved to the same position as this mark.
	 */
	movedMark?: Mark<T>;

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
	modifyAfter?: TNodeChange;
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

	if (effect.movedMark !== undefined) {
		const [_mark1, mark2] = splitMark(effect.movedMark, basisShift);
		adjusted.movedMark = mark2;
	}

	return adjusted;
}

function applyMoveEffectsToDest(
	markEffect: MoveIn,
	count: number,
	revision: RevisionTag | undefined,
	effects: MoveEffectTable<unknown>,
	consumeEffects: boolean,
) {
	updateEndpoint(
		markEffect,
		count,
		CrossFieldTarget.Destination,
		revision,
		effects,
		consumeEffects,
	);
}

function applyMoveEffectsToSource<T>(
	mark: CellMark<MoveOut, T>,
	revision: RevisionTag | undefined,
	effects: MoveEffectTable<T>,
	consumeEffect: boolean,
	composeChildren?: (a: T | undefined, b: T | undefined) => T | undefined,
): Mark<T> {
	let nodeChange = mark.changes;
	const modifyAfter = getModifyAfter(
		effects,
		mark.revision ?? revision,
		mark.id,
		mark.count,
		consumeEffect,
	);
	if (modifyAfter !== undefined) {
		assert(
			composeChildren !== undefined,
			0x569 /* Must provide a change composer if modifying moves */,
		);
		nodeChange = composeChildren(mark.changes, modifyAfter);
	}

	const newMark = cloneMark(mark);
	applySourceEffects(newMark, mark.count, revision, effects, consumeEffect);

	if (nodeChange !== undefined) {
		newMark.changes = nodeChange;
	} else {
		delete newMark.changes;
	}

	return newMark;
}

function applySourceEffects(
	markEffect: MoveOut,
	count: number,
	revision: RevisionTag | undefined,
	effects: MoveEffectTable<unknown>,
	consumeEffects: boolean,
) {
	updateEndpoint(markEffect, count, CrossFieldTarget.Source, revision, effects, consumeEffects);
}

function updateEndpoint(
	markEffect: MoveMarkEffect,
	count: number,
	target: CrossFieldTarget,
	revision: RevisionTag | undefined,
	effects: MoveEffectTable<unknown>,
	consumeEffects: boolean,
) {
	const markRevision = markEffect.revision ?? revision;
	const finalDest = getEndpoint(
		effects,
		target,
		markRevision,
		markEffect.id,
		count,
		consumeEffects,
	);

	if (finalDest !== undefined) {
		if (areEqualCellIds(finalDest, { revision: markRevision, localId: markEffect.id })) {
			delete markEffect.finalEndpoint;
		} else {
			markEffect.finalEndpoint = finalDest;
		}
	}
}

export function applyMoveEffectsToMark<T>(
	mark: Mark<T>,
	revision: RevisionTag | undefined,
	effects: MoveEffectTable<T>,
	consumeEffect: boolean,
	composeChildren?: (a: T | undefined, b: T | undefined) => T | undefined,
): Mark<T>[] {
	if (isAttachAndDetachEffect(mark)) {
		if (isMoveIn(mark.attach)) {
			if (isMoveOut(mark.detach)) {
				// Move effects should not be applied to intermediate move locations.
				return [mark];
			}
			const attachRevision = mark.attach.revision ?? revision;
			const effect = getMoveEffect(
				effects,
				CrossFieldTarget.Destination,
				attachRevision,
				mark.attach.id,
				mark.count,
			);

			if (effect.length < mark.count) {
				const [firstMark, secondMark] = splitMark(mark, effect.length);
				const updatedAttach = firstMark.attach as MoveIn;
				applyMoveEffectsToDest(
					updatedAttach,
					firstMark.count,
					attachRevision,
					effects,
					consumeEffect,
				);
				return [
					{
						...firstMark,
						attach: updatedAttach,
					},
					...applyMoveEffectsToMark(
						secondMark,
						revision,
						effects,
						consumeEffect,
						composeChildren,
					),
				];
			} else {
				const updatedAttach = { ...mark.attach };
				applyMoveEffectsToDest(
					updatedAttach,
					mark.count,
					attachRevision,
					effects,
					consumeEffect,
				);
				return [
					{
						...mark,
						attach: updatedAttach,
					},
				];
			}
		}

		if (isMoveOut(mark.detach)) {
			const detachRevision = mark.detach.revision ?? revision;
			const effect = getMoveEffect(
				effects,
				CrossFieldTarget.Source,
				detachRevision,
				mark.detach.id,
				mark.count,
			);

			if (effect.length < mark.count) {
				const [firstMark, secondMark] = splitMark(mark, effect.length);
				applySourceEffects(
					firstMark.detach as MoveOut,
					firstMark.count,
					detachRevision,
					effects,
					consumeEffect,
				);

				const newFirstChanges = getModifyAfter(
					effects,
					detachRevision,
					firstMark.detach.id,
					firstMark.count,
					consumeEffect,
				);

				if (newFirstChanges !== undefined) {
					assert(
						composeChildren !== undefined,
						0x813 /* Must provide a change composer if modifying moves */,
					);
					firstMark.changes = composeChildren(firstMark.changes, newFirstChanges);
				}

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

			const newMark = cloneMark(mark);
			applySourceEffects(
				newMark.detach as MoveOut,
				mark.count,
				detachRevision,
				effects,
				consumeEffect,
			);

			const newChanges = getModifyAfter(
				effects,
				detachRevision,
				mark.detach.id,
				mark.count,
				consumeEffect,
			);

			if (newChanges !== undefined) {
				assert(
					composeChildren !== undefined,
					0x814 /* Must provide a change composer if modifying moves */,
				);
				newMark.changes = composeChildren(mark.changes, newChanges);
			}

			return [newMark];
		}
	} else if (isMoveMark(mark)) {
		const type = mark.type;
		switch (type) {
			case "MoveOut": {
				const effect = getMoveEffect(
					effects,
					CrossFieldTarget.Source,
					mark.revision ?? revision,
					mark.id,
					mark.count,
				);

				if (effect.length < mark.count) {
					const [firstMark, secondMark] = splitMark(mark, effect.length);
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
						mark,
						revision,
						effects,
						consumeEffect,
						composeChildren,
					),
				];
			}
			case "MoveIn": {
				const effect = getMoveEffect(
					effects,
					CrossFieldTarget.Destination,
					mark.revision ?? revision,
					mark.id,
					mark.count,
				);

				if (effect.length < mark.count) {
					const [firstMark, secondMark] = splitMark(mark, effect.length);
					applyMoveEffectsToDest(
						firstMark,
						firstMark.count,
						revision,
						effects,
						consumeEffect,
					);
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

				const newMark = cloneMark(mark);
				applyMoveEffectsToDest(newMark, mark.count, revision, effects, consumeEffect);
				return [newMark];
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

	if (effect.value?.modifyAfter !== undefined) {
		assert(effect.length === count, 0x6ee /* Expected effect to cover entire mark */);
		if (consumeEffect) {
			const newEffect = { ...effect.value };
			delete newEffect.modifyAfter;
			setMoveEffect(moveEffects, target, revision, id, count, newEffect, false);
		}
		return effect.value.modifyAfter;
	}

	return undefined;
}

function getEndpoint(
	moveEffects: MoveEffectTable<unknown>,
	target: CrossFieldTarget,
	revision: RevisionTag | undefined,
	id: MoveId,
	count: number,
	consumeEffect: boolean = true,
): ChangeAtomId | undefined {
	const effect = getMoveEffect(moveEffects, target, revision, id, count);
	assert(effect.length === count, 0x815 /* Expected effect to cover entire mark */);
	if (effect.value?.endpoint === undefined) {
		return undefined;
	}

	if (consumeEffect) {
		const newEffect = { ...effect.value };
		delete newEffect.endpoint;
		setMoveEffect(moveEffects, target, revision, id, count, newEffect, false);
	}
	return effect.value.endpoint;
}
