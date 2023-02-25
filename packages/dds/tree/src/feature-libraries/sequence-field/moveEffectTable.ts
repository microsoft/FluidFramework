/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert, unreachableCase } from "@fluidframework/common-utils";
import { RevisionTag } from "../../core";
import { clone, fail } from "../../util";
import { CrossFieldManager, CrossFieldTarget, IdAllocator } from "../modular-schema";
import {
	InputSpanningMark,
	Mark,
	MoveId,
	MoveIn,
	MoveOut,
	OutputSpanningMark,
	ReturnFrom,
	ReturnTo,
	Skip,
} from "./format";
import { getInputLength, getOutputLength, isSkipMark } from "./utils";

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
	 * When true, this mark should be deleted.
	 */
	shouldRemove?: boolean;

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
): MoveEffect<T> {
	if (resetMerges) {
		clearMergeability(moveEffects, target, revision, id);
	}
	return moveEffects.getOrCreate(target, revision, id, {});
}

export function getMoveEffect<T>(
	moveEffects: MoveEffectTable<T>,
	target: CrossFieldTarget,
	revision: RevisionTag | undefined,
	id: MoveId,
): MoveEffect<T> {
	return moveEffects.get(target, revision, id) ?? {};
}

export function clearMergeability<T>(
	moveEffects: MoveEffectTable<T>,
	target: CrossFieldTarget,
	revision: RevisionTag | undefined,
	id: MoveId,
): void {
	const effect = getOrAddEffect(moveEffects, target, revision, id);
	if (effect.mergeLeft !== undefined) {
		delete getOrAddEffect(moveEffects, target, revision, effect.mergeLeft).mergeRight;
		delete effect.mergeLeft;
	}
	if (effect.mergeRight !== undefined) {
		delete getOrAddEffect(moveEffects, target, revision, effect.mergeRight).mergeLeft;
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
	getOrAddEffect(moveEffects, target, revision, leftId).mergeRight = rightId;
	getOrAddEffect(moveEffects, target, revision, rightId).mergeLeft = leftId;
}

export type MoveMark<T> = MoveOut<T> | MoveIn | ReturnFrom<T> | ReturnTo;

export function isMoveMark<T>(mark: Mark<T>): mark is MoveMark<T> {
	if (isSkipMark(mark)) {
		return false;
	}
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
	if (effect.mark !== undefined) {
		result.push(effect.mark);
	} else {
		if (!effect.shouldRemove) {
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
		}
	}

	if (effect.child !== undefined) {
		const childEffect = getMoveEffect(
			effects,
			CrossFieldTarget.Destination,
			mark.revision ?? revision,
			effect.child,
		);
		assert(childEffect.count !== undefined, 0x567 /* Child effects should have size */);

		const newMark: Mark<T> = {
			...mark,
			id: effect.child,
			count: childEffect.count,
		};

		if (mark.type === "ReturnTo" && mark.detachIndex !== undefined) {
			assert(
				effect.count !== undefined,
				0x568 /* Should define count when splitting a mark */,
			);
			(newMark as ReturnTo).detachIndex = mark.detachIndex + effect.count;
		}

		result.push(...applyMoveEffectsToDest(newMark, revision, effects, consumeEffect));
	}

	if (consumeEffect) {
		delete effect.mark;
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
	const effect = getOrAddEffect(
		effects,
		CrossFieldTarget.Source,
		mark.revision ?? revision,
		mark.id,
	);
	const result: Mark<T>[] = [];
	if (effect.mark !== undefined) {
		result.push(effect.mark);
	} else if (!effect.shouldRemove) {
		const newMark = clone(mark);
		newMark.count = effect.count ?? newMark.count;
		if (effect.modifyAfter !== undefined) {
			assert(
				composeChildren !== undefined,
				0x569 /* Must provide a change composer if modifying moves */,
			);
			const changes = composeChildren(newMark.changes, effect.modifyAfter);
			if (changes !== undefined) {
				newMark.changes = changes;
			} else {
				delete newMark.changes;
			}
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
	}

	if (effect.child !== undefined) {
		const childEffect = getMoveEffect(
			effects,
			CrossFieldTarget.Source,
			mark.revision ?? revision,
			effect.child,
		);
		assert(childEffect.count !== undefined, 0x56b /* Child effects should have size */);
		const newMark: MoveOut<T> | ReturnFrom<T> = {
			...mark,
			id: effect.child,
			count: childEffect.count,
		};
		if (mark.type === "ReturnFrom" && mark.detachIndex !== undefined) {
			assert(
				effect.count !== undefined,
				0x56c /* Should define count when splitting a mark */,
			);
			(newMark as ReturnFrom).detachIndex = mark.detachIndex + effect.count;
		}
		result.push(
			...applyMoveEffectsToSource(newMark, revision, effects, consumeEffect, composeChildren),
		);
	}

	if (consumeEffect) {
		delete effect.mark;
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

// TODO: These functions should not be in this file.
/**
 * Splits the `mark` into two marks such that the first returned mark has input length `length`.
 * @param mark - The mark to split.
 * @param revision - The revision of the changeset the mark is part of.
 * @param length - The desired length for the first of the two returned marks.
 * @param genId - An ID allocator
 * @param moveEffects - The table in which to record splitting of move marks
 * @param recordMoveEffect - Whether when splitting a move an entry should be added to `moveEffects` indicating that the mark should be split (in case we process this mark again).
 * An entry is always added to `moveEffects` indicating that the opposite end of the move should be split.
 * @returns A pair of marks equivalent to the original `mark`
 * such that the first returned mark has input length `length`.
 */
export function splitMarkOnInput<T, TMark extends InputSpanningMark<T>>(
	mark: TMark,
	revision: RevisionTag | undefined,
	length: number,
	genId: IdAllocator,
	moveEffects: MoveEffectTable<T>,
	recordMoveEffect: boolean = false,
): [TMark, TMark] {
	const markLength = getInputLength(mark);
	const remainder = markLength - length;
	if (length < 1 || remainder < 1) {
		fail("Unable to split mark due to lengths");
	}
	if (isSkipMark(mark)) {
		return [length, remainder] as [TMark, TMark];
	}
	const markObj = mark as Exclude<TMark, Skip>;
	const type = mark.type;
	switch (type) {
		case "Modify":
			fail("Unable to split Modify mark of length 1");
		case "ReturnTo": {
			const newId = genId();
			splitMove(
				moveEffects,
				CrossFieldTarget.Source,
				mark.revision ?? revision,
				mark.id,
				newId,
				length,
				remainder,
			);
			if (recordMoveEffect) {
				splitMove(
					moveEffects,
					CrossFieldTarget.Destination,
					mark.revision ?? revision,
					mark.id,
					newId,
					length,
					remainder,
				);
			}
			return [
				{ ...markObj, count: length },
				{ ...markObj, id: newId, count: remainder, detachIndex: mark.detachIndex + length },
			] as [TMark, TMark];
		}
		case "Revive":
			return [
				{ ...markObj, count: length },
				{ ...markObj, count: remainder, detachIndex: mark.detachIndex + length },
			] as [TMark, TMark];
		case "Delete":
			return [
				{ ...markObj, count: length },
				{ ...markObj, count: remainder },
			] as [TMark, TMark];
		case "MoveOut":
		case "ReturnFrom": {
			// TODO: Handle detach index for ReturnFrom
			const newId = genId();
			splitMove(
				moveEffects,
				CrossFieldTarget.Destination,
				mark.revision ?? revision,
				mark.id,
				newId,
				length,
				remainder,
			);
			if (recordMoveEffect) {
				splitMove(
					moveEffects,
					CrossFieldTarget.Source,
					mark.revision ?? revision,
					mark.id,
					newId,
					length,
					remainder,
				);
			}
			const mark1 = { ...markObj, count: length };
			const mark2 = { ...markObj, id: newId, count: remainder };
			if (mark.type === "ReturnFrom" && mark.detachIndex !== undefined) {
				(mark2 as unknown as ReturnFrom<unknown>).detachIndex = mark.detachIndex + length;
			}
			return [mark1, mark2];
		}
		default:
			unreachableCase(type);
	}
}

/**
 * Splits the `mark` into two marks such that the first returned mark has output length `length`.
 * @param mark - The mark to split.
 * @param revision - The revision of the changeset the mark is part of.
 * @param length - The desired length for the first of the two returned marks.
 * @param genId - An ID allocator
 * @param moveEffects - The table in which to record splitting of move marks
 * @param recordMoveEffect - Whether when splitting a move an entry should be added to `moveEffects` indicating that the mark should be split (in case we process this mark again).
 * An entry is always added to `moveEffects` indicating that the opposite end of the move should be split.
 * @returns A pair of marks equivalent to the original `mark`
 * such that the first returned mark has output length `length`.
 */
export function splitMarkOnOutput<T, TMark extends OutputSpanningMark<T>>(
	mark: TMark,
	revision: RevisionTag | undefined,
	length: number,
	genId: IdAllocator,
	moveEffects: MoveEffectTable<T>,
	recordMoveEffect: boolean = false,
	ignorePairing: boolean = false,
): [TMark, TMark] {
	const markLength = getOutputLength(mark, ignorePairing);
	const remainder = markLength - length;
	if (length < 1 || remainder < 1) {
		fail("Unable to split mark due to lengths");
	}
	if (isSkipMark(mark)) {
		return [length, remainder] as [TMark, TMark];
	}
	const markObj = mark as Exclude<TMark, Skip>;
	const type = markObj.type;
	switch (type) {
		case "Modify":
			fail(`Unable to split ${type} mark of length 1`);
		case "Insert":
			return [
				{ ...markObj, content: markObj.content.slice(0, length) },
				{ ...markObj, content: markObj.content.slice(length) },
			];
		case "MoveIn":
		case "ReturnTo": {
			const newId = genId();
			splitMove(
				moveEffects,
				CrossFieldTarget.Source,
				markObj.revision ?? revision,
				markObj.id,
				newId,
				length,
				remainder,
			);
			if (recordMoveEffect) {
				splitMove(
					moveEffects,
					CrossFieldTarget.Destination,
					markObj.revision ?? revision,
					markObj.id,
					newId,
					length,
					remainder,
				);
			}
			return [
				{ ...markObj, count: length },
				type === "MoveIn"
					? { ...markObj, id: newId, count: remainder }
					: {
							...markObj,
							id: newId,
							count: remainder,
							detachIndex: markObj.detachIndex + length,
					  },
			];
		}
		case "Revive":
			return [
				{ ...markObj, count: length },
				{ ...markObj, count: remainder, detachIndex: markObj.detachIndex + length },
			];
		default:
			unreachableCase(type);
	}
}
