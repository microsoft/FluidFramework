/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert, unreachableCase } from "@fluidframework/common-utils";
import { RevisionTag } from "../../core";
import { CrossFieldManager, CrossFieldRange, CrossFieldTarget } from "../modular-schema";
import { Mark, MoveId, MoveIn, MoveOut, ReturnFrom, ReturnTo } from "./format";
import { cloneMark, splitMark } from "./utils";

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
): CrossFieldRange<MoveEffect<T>> | undefined {
	return moveEffects.get(target, revision, id, count, addDependency);
}

export type MoveMark<T> = MoveOut<T> | MoveIn | ReturnFrom<T> | ReturnTo;

export function isMoveMark<T>(mark: Mark<T>): mark is MoveMark<T> {
	switch (mark.type) {
		case "MoveIn":
		case "MoveOut":
		case "ReturnFrom":
		case "ReturnTo":
			return true;
		default:
			return false;
	}
}

function applyMoveEffectsToDest<T>(
	mark: MoveIn | ReturnTo,
	revision: RevisionTag | undefined,
	effects: MoveEffectTable<T>,
	consumeEffect: boolean,
): Mark<T> {
	const newMark: MoveIn | ReturnTo = {
		...mark,
	};

	const statusUpdate = getPairedMarkStatus(
		effects,
		CrossFieldTarget.Destination,
		mark.revision ?? revision,
		mark.id,
		mark.count,
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
	mark: MoveOut<T> | ReturnFrom<T>,
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
	if (nodeChange !== undefined) {
		newMark.changes = nodeChange;
	} else {
		delete newMark.changes;
	}

	const statusUpdate = getPairedMarkStatus(
		effects,
		CrossFieldTarget.Source,
		mark.revision ?? revision,
		mark.id,
		mark.count,
		consumeEffect,
	);
	if (statusUpdate !== undefined) {
		assert(
			newMark.type === "ReturnFrom",
			0x56a /* TODO: support updating MoveOut.isSrcConflicted */,
		);
		if (statusUpdate === PairedMarkUpdate.Deactivated) {
			newMark.isDstConflicted = true;
		} else {
			delete newMark.isDstConflicted;
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
				if (effect === undefined) {
					return [mark];
				}

				if (effect.id > mark.id) {
					const [firstMark, secondMark] = splitMark(mark, effect.id - mark.id);
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

				const lastEffectId = (effect.id as number) + effect.length - 1;
				const lastMarkId = (mark.id as number) + mark.count - 1;
				if (lastEffectId < lastMarkId) {
					const [firstMark, secondMark] = splitMark(mark, lastEffectId - mark.id + 1);
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
				if (effect === undefined) {
					return [mark];
				}

				if (effect.id > mark.id) {
					const [firstMark, secondMark] = splitMark(mark, effect.id - mark.id);
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

				const lastEffectId = (effect.id as number) + effect.length - 1;
				const lastMarkId = (mark.id as number) + mark.count - 1;
				if (lastEffectId < lastMarkId) {
					const [firstMark, secondMark] = splitMark(mark, lastEffectId - mark.id + 1);
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
				return [applyMoveEffectsToDest(mark, revision, effects, consumeEffect)];
			}
			default:
				unreachableCase(type);
		}
	}
	return [mark];
}

export function getModifyAfter<T>(
	moveEffects: MoveEffectTable<T>,
	revision: RevisionTag | undefined,
	id: MoveId,
	count: number,
	consumeEffect: boolean = true,
): T | undefined {
	const target = CrossFieldTarget.Source;
	const effect = getMoveEffect(moveEffects, target, revision, id, count);

	if (effect?.data.modifyAfter !== undefined) {
		assert(
			effect.id <= id && (effect.id as number) + effect.length >= (id as number) + count,
			"Expected effect to cover entire mark",
		);
		if (consumeEffect) {
			const newEffect = { ...effect.data };
			delete newEffect.modifyAfter;
			setMoveEffect(moveEffects, target, revision, id, count, newEffect, false);
		}
		return effect.data.modifyAfter;
	}

	return undefined;
}

function getPairedMarkStatus<T>(
	moveEffects: MoveEffectTable<T>,
	target: CrossFieldTarget,
	revision: RevisionTag | undefined,
	id: MoveId,
	count: number,
	consumeEffect: boolean = true,
): PairedMarkUpdate | undefined {
	const effect = getMoveEffect(moveEffects, target, revision, id, count);

	if (effect?.data.pairedMarkStatus !== undefined) {
		assert(
			effect.id <= id && (effect.id as number) + effect.length >= (id as number) + count,
			"Expected effect to cover entire mark",
		);
		if (consumeEffect) {
			const newEffect = { ...effect.data };
			delete newEffect.pairedMarkStatus;
			setMoveEffect(moveEffects, target, revision, id, count, newEffect, false);
		}
		return effect.data.pairedMarkStatus;
	}

	return undefined;
}
