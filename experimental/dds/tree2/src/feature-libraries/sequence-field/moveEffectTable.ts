/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert, unreachableCase } from "@fluidframework/core-utils";
import { RevisionTag } from "../../core";
import { CrossFieldManager, CrossFieldTarget } from "../modular-schema";
import { RangeQueryResult } from "../../util";
import {
	CellMark,
	Mark,
	MarkEffect,
	MoveDestination,
	MoveId,
	MoveMarkEffect,
	MoveSource,
} from "./format";
import { cloneMark, isTransientEffect, splitMark, withNodeChange } from "./utils";

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
	 * Represents the new value for the `isSrcConflicted` or `isDstConflicted` field of this mark.
	 */
	pairedMarkStatus?: PairedMarkUpdate;
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
): RangeQueryResult<MoveEffect<T>> {
	return moveEffects.get(target, revision, id, count, addDependency);
}

export type MoveMark<T> = CellMark<MoveMarkEffect, T>;

export function isMoveMark(effect: MarkEffect): effect is MoveMarkEffect {
	return isMoveSource(effect) || isMoveDestination(effect);
}

export function isMoveSource(effect: MarkEffect): effect is MoveSource {
	switch (effect.type) {
		case "MoveOut":
		case "ReturnFrom":
			return true;
		default:
			return false;
	}
}

export function isMoveDestination(effect: MarkEffect): effect is MoveDestination {
	switch (effect.type) {
		case "MoveIn":
		case "ReturnTo":
			return true;
		default:
			return false;
	}
}

function updateDestPairedMarkStatus(
	markEffect: MoveDestination,
	count: number,
	revision: RevisionTag | undefined,
	effects: MoveEffectTable<unknown>,
	consumeEffect: boolean,
): MoveDestination {
	const newMark: MoveDestination = {
		...markEffect,
	};

	const statusUpdate = getPairedMarkStatus(
		effects,
		CrossFieldTarget.Destination,
		markEffect.revision ?? revision,
		markEffect.id,
		count,
		consumeEffect,
	);
	if (statusUpdate === PairedMarkUpdate.Deactivated) {
		newMark.isSrcConflicted = true;
	} else if (statusUpdate === PairedMarkUpdate.Reactivated) {
		delete newMark.isSrcConflicted;
	}

	return newMark;
}

function applyMoveEffectsToSource<T>(
	mark: CellMark<MoveSource, T>,
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

	const newMark = {
		...mark,
		...updateSourcePairedMarkStatus(mark, mark.count, revision, effects, consumeEffect),
	};
	if (nodeChange !== undefined) {
		newMark.changes = nodeChange;
	} else {
		delete newMark.changes;
	}

	return newMark;
}

function updateSourcePairedMarkStatus(
	markEffect: MoveSource,
	count: number,
	revision: RevisionTag | undefined,
	effects: MoveEffectTable<unknown>,
	consumeEffect: boolean,
): MoveSource {
	const statusUpdate = getPairedMarkStatus(
		effects,
		CrossFieldTarget.Source,
		markEffect.revision ?? revision,
		markEffect.id,
		count,
		consumeEffect,
	);

	const newMarkEffect = { ...markEffect };
	if (statusUpdate !== undefined) {
		assert(
			newMarkEffect.type === "ReturnFrom",
			0x56a /* TODO: support updating MoveOut.isSrcConflicted */,
		);
		if (statusUpdate === PairedMarkUpdate.Deactivated) {
			newMarkEffect.isDstConflicted = true;
		} else {
			delete newMarkEffect.isDstConflicted;
		}
	}

	return newMarkEffect;
}

export function applyMoveEffectsToMark<T>(
	mark: Mark<T>,
	revision: RevisionTag | undefined,
	effects: MoveEffectTable<T>,
	consumeEffect: boolean,
	composeChildren?: (a: T | undefined, b: T | undefined) => T | undefined,
): Mark<T>[] {
	if (isTransientEffect(mark)) {
		if (isMoveDestination(mark.attach)) {
			const attachRevision = mark.attach.revision ?? mark.revision ?? revision;
			assert(!isMoveSource(mark.detach), "TODO: Handle transient moves");
			const effect = getMoveEffect(
				effects,
				CrossFieldTarget.Destination,
				attachRevision,
				mark.attach.id,
				mark.count,
			);

			if (effect.length < mark.count) {
				const [firstMark, secondMark] = splitMark(mark, effect.length);
				return [
					{
						...firstMark,
						attach: updateDestPairedMarkStatus(
							firstMark.attach as MoveDestination,
							firstMark.count,
							attachRevision,
							effects,
							consumeEffect,
						),
					},
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
				{
					...mark,
					attach: updateDestPairedMarkStatus(
						mark.attach,
						mark.count,
						attachRevision,
						effects,
						consumeEffect,
					),
				},
			];
		}

		if (isMoveSource(mark.detach)) {
			const detachRevision = mark.detach.revision ?? mark.revision ?? revision;
			const effect = getMoveEffect(
				effects,
				CrossFieldTarget.Source,
				detachRevision,
				mark.detach.id,
				mark.count,
			);

			if (effect.length < mark.count) {
				const [firstMark, secondMark] = splitMark(mark, effect.length);
				const updatedFirstMark = {
					...firstMark,
					detach: updateSourcePairedMarkStatus(
						firstMark.detach as MoveSource,
						firstMark.count,
						detachRevision,
						effects,
						consumeEffect,
					),
				};

				const newChanges = getModifyAfter(
					effects,
					detachRevision,
					firstMark.detach.id,
					firstMark.count,
					consumeEffect,
				);

				if (newChanges !== undefined) {
					assert(
						composeChildren !== undefined,
						"Must provide a change composer if modifying moves",
					);
					updatedFirstMark.changes = composeChildren(firstMark.changes, newChanges);
				}

				return [
					updatedFirstMark,
					...applyMoveEffectsToMark(
						secondMark,
						revision,
						effects,
						consumeEffect,
						composeChildren,
					),
				];
			}

			const updatedMark = {
				...mark,
				detach: updateSourcePairedMarkStatus(
					mark.detach,
					mark.count,
					detachRevision,
					effects,
					consumeEffect,
				),
			};

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
					"Must provide a change composer if modifying moves",
				);
				updatedMark.changes = composeChildren(mark.changes, newChanges);
			}

			return [updatedMark];
		}
	} else if (isMoveMark(mark)) {
		const type = mark.type;
		switch (type) {
			case "MoveOut":
			case "ReturnFrom": {
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
			case "MoveIn":
			case "ReturnTo": {
				const effect = getMoveEffect(
					effects,
					CrossFieldTarget.Destination,
					mark.revision ?? revision,
					mark.id,
					mark.count,
				);

				if (effect.length > mark.count) {
					const [firstMark, secondMark] = splitMark(mark, effect.length);
					return [
						{
							...firstMark,
							...updateDestPairedMarkStatus(
								firstMark,
								firstMark.count,
								revision,
								effects,
								consumeEffect,
							),
						},
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
					{
						...mark,
						...updateDestPairedMarkStatus(
							mark,
							mark.count,
							revision,
							effects,
							consumeEffect,
						),
					},
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

	if (effect.value?.pairedMarkStatus !== undefined) {
		assert(effect.length === count, 0x6ef /* Expected effect to cover entire mark */);
		if (consumeEffect) {
			const newEffect = { ...effect.value };
			delete newEffect.pairedMarkStatus;
			setMoveEffect(moveEffects, target, revision, id, count, newEffect, false);
		}
		return effect.value.pairedMarkStatus;
	}

	return undefined;
}
