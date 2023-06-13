/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert, unreachableCase } from "@fluidframework/common-utils";
import { RevisionTag } from "../../core";
import { CrossFieldManager, CrossFieldTarget } from "../modular-schema";
import { Mark, MoveId, MoveIn, MoveOut, ReturnFrom, ReturnTo } from "./format";
import { cloneMark } from "./utils";

export type MoveEffectTable<T> = CrossFieldManager<MoveEffect<T>>;

/**
 * Changes to be applied to a move mark.
 */
export interface MoveEffect<T> {
	/**
	 * The size of the mark after splitting. Only defined if child is defined.
	 */
	count?: number;

	/**
	 * The ID of a new mark which should be created by splitting off a portion of the end of this mark.
	 * There should be an entry in the MoveEffectTable for this ID.
	 */
	child?: MoveId;

	/**
	 * If defined, this move mark should be replaced by `mark`.
	 */
	mark?: Mark<T>;

	/**
	 * The ID of a mark which this mark is allowed to merge left into.
	 */
	mergeLeft?: MoveId;

	/**
	 * The ID of a mark which can be merged into this mark from the right.
	 */
	mergeRight?: MoveId;

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

export function splitMove<T>(
	effects: MoveEffectTable<T>,
	target: CrossFieldTarget,
	revision: RevisionTag | undefined,
	id: MoveId,
	newId: MoveId,
	count1: number,
	count2: number,
): void {
	assert(newId !== id, 0x5ba /* Must have distinct ID for each piece of the split mark */);
	const effect = getOrAddEffect(effects, target, revision, id);
	const newEffect = getOrAddEffect(effects, target, revision, newId);
	newEffect.count = count2;
	if (effect.child !== undefined) {
		newEffect.child = effect.child;
	}

	effect.child = newId;
	effect.count = count1;
}

export function getOrAddEffect<T>(
	moveEffects: MoveEffectTable<T>,
	target: CrossFieldTarget,
	revision: RevisionTag | undefined,
	id: MoveId,
	resetMerges: boolean = false,
	invalidate: boolean = true,
): MoveEffect<T> {
	if (resetMerges) {
		clearMergeability(moveEffects, target, revision, id);
	}
	return moveEffects.getOrCreate(target, revision, id, {}, invalidate);
}

export function getMoveEffect<T>(
	moveEffects: MoveEffectTable<T>,
	target: CrossFieldTarget,
	revision: RevisionTag | undefined,
	id: MoveId,
	addDependency: boolean = true,
): MoveEffect<T> {
	return moveEffects.get(target, revision, id, addDependency) ?? {};
}

export function clearMergeability<T>(
	moveEffects: MoveEffectTable<T>,
	target: CrossFieldTarget,
	revision: RevisionTag | undefined,
	id: MoveId,
): void {
	const effect = getOrAddEffect(moveEffects, target, revision, id);
	if (effect.mergeLeft !== undefined) {
		delete getOrAddEffect(moveEffects, target, revision, effect.mergeLeft, false, false)
			.mergeRight;
		delete effect.mergeLeft;
	}
	if (effect.mergeRight !== undefined) {
		delete getOrAddEffect(moveEffects, target, revision, effect.mergeRight, false, false)
			.mergeLeft;
		delete effect.mergeRight;
	}
}

export function makeMergeable<T>(
	moveEffects: MoveEffectTable<T>,
	target: CrossFieldTarget,
	revision: RevisionTag | undefined,
	leftId: MoveId,
	rightId: MoveId,
): void {
	getOrAddEffect(moveEffects, target, revision, leftId, false, false).mergeRight = rightId;
	getOrAddEffect(moveEffects, target, revision, rightId, false, false).mergeLeft = leftId;
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
): Mark<T>[] {
	const effect = getMoveEffect(
		effects,
		CrossFieldTarget.Destination,
		mark.revision ?? revision,
		mark.id,
	);
	const result: Mark<T>[] = [];

	assert(effect.modifyAfter === undefined, 0x566 /* Cannot modify move destination */);

	const newMark: MoveIn | ReturnTo = {
		...mark,
		count: effect.count ?? mark.count,
	};
	if (effect.pairedMarkStatus !== undefined) {
		if (effect.pairedMarkStatus === PairedMarkUpdate.Deactivated) {
			newMark.isSrcConflicted = true;
		} else {
			delete newMark.isSrcConflicted;
		}
	}
	result.push(newMark);

	if (effect.child !== undefined) {
		const childEffect = getMoveEffect(
			effects,
			CrossFieldTarget.Destination,
			mark.revision ?? revision,
			effect.child,
		);
		assert(childEffect.count !== undefined, 0x567 /* Child effects should have size */);

		const secondMark: Mark<T> = {
			...mark,
			id: effect.child,
			count: childEffect.count,
		};

		if (secondMark.type === "ReturnTo" && secondMark.detachEvent !== undefined) {
			assert(
				effect.count !== undefined,
				0x699 /* Should have a count when splitting a mark */,
			);
			secondMark.detachEvent = {
				...secondMark.detachEvent,
				index: secondMark.detachEvent.index + effect.count,
			};
		}

		// TODO: Split detachEvent if necessary
		result.push(...applyMoveEffectsToDest(secondMark, revision, effects, consumeEffect));
	}

	if (consumeEffect) {
		delete effect.count;
		delete effect.child;
	}
	return result;
}

function applyMoveEffectsToSource<T>(
	mark: MoveOut<T> | ReturnFrom<T>,
	revision: RevisionTag | undefined,
	effects: MoveEffectTable<T>,
	consumeEffect: boolean,
	composeChildren?: (a: T | undefined, b: T | undefined) => T | undefined,
): Mark<T>[] {
	const effect = getMoveEffect(
		effects,
		CrossFieldTarget.Source,
		mark.revision ?? revision,
		mark.id,
	);
	const result: Mark<T>[] = [];

	let nodeChange = mark.changes;
	if (effect.modifyAfter !== undefined) {
		assert(
			composeChildren !== undefined,
			0x569 /* Must provide a change composer if modifying moves */,
		);
		nodeChange = composeChildren(mark.changes, effect.modifyAfter);
	}

	const newMark = cloneMark(mark);
	newMark.count = effect.count ?? newMark.count;

	if (nodeChange !== undefined) {
		newMark.changes = nodeChange;
	} else {
		delete newMark.changes;
	}
	if (effect.pairedMarkStatus !== undefined) {
		assert(
			newMark.type === "ReturnFrom",
			0x56a /* TODO: support updating MoveOut.isSrcConflicted */,
		);
		if (effect.pairedMarkStatus === PairedMarkUpdate.Deactivated) {
			newMark.isDstConflicted = true;
		} else {
			delete newMark.isDstConflicted;
		}
	}
	result.push(newMark);

	if (effect.child !== undefined) {
		const childEffect = getMoveEffect(
			effects,
			CrossFieldTarget.Source,
			mark.revision ?? revision,
			effect.child,
		);
		assert(childEffect.count !== undefined, 0x56b /* Child effects should have size */);
		const splitMark: MoveOut<T> | ReturnFrom<T> = {
			...mark,
			id: effect.child,
			count: childEffect.count,
		};
		if (splitMark.detachEvent !== undefined) {
			assert(
				effect.count !== undefined,
				0x69a /* Should specify a count when splitting a mark */,
			);
			splitMark.detachEvent = {
				...splitMark.detachEvent,
				index: splitMark.detachEvent.index + effect.count,
			};
		}
		result.push(
			...applyMoveEffectsToSource(
				splitMark,
				revision,
				effects,
				consumeEffect,
				composeChildren,
			),
		);
	}

	if (consumeEffect) {
		delete effect.count;
		delete effect.child;
		delete effect.modifyAfter;
	}
	return result;
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
				return applyMoveEffectsToSource(
					mark,
					revision,
					effects,
					consumeEffect,
					composeChildren,
				);
			}
			case "MoveIn":
			case "ReturnTo": {
				return applyMoveEffectsToDest(mark, revision, effects, consumeEffect);
			}
			default:
				unreachableCase(type);
		}
	}
	return [mark];
}
