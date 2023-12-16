/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert, unreachableCase } from "@fluidframework/core-utils";
import { ChangeAtomId, RevisionTag, TaggedChange } from "../../core";
import { CrossFieldManager, CrossFieldTarget } from "../modular-schema";
import { RangeQueryResult, brand } from "../../util";
import { CellMark, Mark, MarkEffect, MoveId, MoveIn, MoveOut } from "./types";
import { areEqualCellIds, cloneMark, isAttachAndDetachEffect, splitMark } from "./utils";
import { MoveMarkEffect, tryGetVestigialEndpoint } from "./helperTypes";

export type MoveEffectTable<T> = CrossFieldManager<MoveEffect<T>>;

/**
 * Changes to be applied to a move mark.
 */
export interface MoveEffect<T> {
	/**
	 * Node changes which should be applied to this mark.
	 * If this mark already has node changes, `modifyAfter` should be composed as later changes.
	 */
	modifyAfter?: TaggedChange<T>;

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
	mark: Mark<T>,
	endpoint: ChangeAtomId,
	updateFinalEndpoint: boolean,
	revision: RevisionTag | undefined,
	effects: MoveEffectTable<T>,
	consumeEffect: boolean,
	composeChildren?: (a: T | undefined, b: TaggedChange<T>) => T | undefined,
): Mark<T> {
	let nodeChange = mark.changes;
	const modifyAfter = getModifyAfter(
		effects,
		endpoint.revision ?? revision,
		endpoint.localId,
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
	if (updateFinalEndpoint && isMoveOut(newMark)) {
		applySourceEffects(newMark, mark.count, revision, effects, consumeEffect);
	}

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
	composeChildren?: (a: T | undefined, b: TaggedChange<T>) => T | undefined,
): Mark<T>[] {
	return applyMoveEffectsToActiveMarks<T>(
		applyMoveEffectsToVestigialMarks<T>(
			[mark],
			effects,
			revision,
			consumeEffect,
			composeChildren,
		),
		revision,
		effects,
		consumeEffect,
		composeChildren,
	);
}

function applyMoveEffectsToVestigialMarks<T>(
	inputQueue: Mark<T>[],
	effects: MoveEffectTable<T>,
	revision: RevisionTag | undefined,
	consumeEffect: boolean,
	composeChildren: ((a: T | undefined, b: TaggedChange<T>) => T | undefined) | undefined,
): Mark<T>[] {
	const outputQueue: Mark<T>[] = [];
	let mark = inputQueue.shift();
	while (mark !== undefined) {
		const vestige = tryGetVestigialEndpoint(mark);
		if (vestige !== undefined) {
			const effect = getMoveEffect(
				effects,
				CrossFieldTarget.Source,
				vestige.revision ?? revision,
				vestige.localId,
				mark.count,
			);
			if (effect.length < mark.count) {
				const [firstMark, secondMark] = splitMark(mark, effect.length);
				mark = firstMark;
				inputQueue.unshift(secondMark);
			}

			outputQueue.push(
				applyMoveEffectsToSource(
					mark,
					vestige,
					false,
					revision,
					effects,
					consumeEffect,
					composeChildren,
				),
			);
		} else {
			outputQueue.push(mark);
		}
		mark = inputQueue.shift();
	}
	return outputQueue;
}

function applyMoveEffectsToActiveMarks<T>(
	inputQueue: Mark<T>[],
	revision: RevisionTag | undefined,
	effects: MoveEffectTable<T>,
	consumeEffect: boolean,
	composeChildren: ((a: T | undefined, b: TaggedChange<T>) => T | undefined) | undefined,
) {
	const outputQueue: Mark<T>[] = [];
	let mark = inputQueue.shift();
	while (mark !== undefined) {
		if (isAttachAndDetachEffect(mark)) {
			if (isMoveIn(mark.attach)) {
				if (isMoveOut(mark.detach)) {
					// Move effects should not be applied to intermediate move locations.
					outputQueue.push(mark);
				} else {
					const attachRevision = mark.attach.revision ?? revision;
					const effect = getMoveEffect(
						effects,
						CrossFieldTarget.Destination,
						attachRevision,
						mark.attach.id,
						mark.count,
					);

					let updatedAttach: MoveIn;
					if (effect.length < mark.count) {
						const [firstMark, secondMark] = splitMark(mark, effect.length);
						mark = firstMark;
						updatedAttach = firstMark.attach as MoveIn;
						inputQueue.unshift(secondMark);
					} else {
						updatedAttach = { ...mark.attach };
					}
					applyMoveEffectsToDest(
						updatedAttach,
						mark.count,
						attachRevision,
						effects,
						consumeEffect,
					);
					outputQueue.push({
						...mark,
						attach: updatedAttach,
					});
				}
			} else if (isMoveOut(mark.detach)) {
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
					mark = firstMark;
					inputQueue.unshift(secondMark);
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

				outputQueue.push(newMark);
			} else {
				outputQueue.push(mark);
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
						mark = firstMark;
						inputQueue.unshift(secondMark);
					}

					outputQueue.push(
						applyMoveEffectsToSource(
							mark,
							{ revision: mark.revision, localId: mark.id },
							true,
							revision,
							effects,
							consumeEffect,
							composeChildren,
						),
					);
					break;
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
						mark = firstMark;
						inputQueue.unshift(secondMark);
					}

					const newMark = cloneMark(mark);
					applyMoveEffectsToDest(
						newMark as CellMark<MoveIn, T>,
						mark.count,
						revision,
						effects,
						consumeEffect,
					);
					outputQueue.push(newMark);
					break;
				}
				default:
					unreachableCase(type);
			}
		} else {
			outputQueue.push(mark);
		}
		mark = inputQueue.shift();
	}
	return outputQueue;
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
): TaggedChange<T> | undefined {
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
