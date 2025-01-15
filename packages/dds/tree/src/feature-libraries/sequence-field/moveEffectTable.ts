/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert, unreachableCase } from "@fluidframework/core-utils/internal";

import type { ChangeAtomId, RevisionTag, TaggedChange } from "../../core/index.js";
import { type RangeQueryResult, brand } from "../../util/index.js";
import {
	type CrossFieldManager,
	CrossFieldTarget,
	type NodeId,
} from "../modular-schema/index.js";

import type { MoveMarkEffect } from "./helperTypes.js";
import type { CellMark, Detach, Mark, MarkEffect, MoveId, MoveIn, MoveOut } from "./types.js";
import { isAttachAndDetachEffect, splitMark, splitMarkEffect } from "./utils.js";

export type MoveEffectTable = CrossFieldManager<MoveEffect>;

/**
 * Changes to be applied to a move mark.
 */
export interface MoveEffect {
	/**
	 * Node changes which should be applied to this mark.
	 * If this mark already has node changes, `modifyAfter` should be composed as later changes.
	 */
	modifyAfter?: NodeId;

	/**
	 * Only used during rebasing.
	 * An effect from changeset being rebased which should be moved to the same position as this mark.
	 */
	movedEffect?: Detach;

	/**
	 * Rebased changes for a node which has been moved to the position of this mark.
	 */
	rebasedChanges?: NodeId;

	/**
	 * The ID of the other outer endpoint.
	 * Used when this is the outer endpoint in a move chain which is being composed with another move chain.
	 */
	endpoint?: ChangeAtomId;

	/**
	 * The ID of the truncated endpoint.
	 * Used when this mark is the outer endpoint of a chain being composed with a redundant move chain.
	 */
	truncatedEndpoint?: ChangeAtomId;

	/**
	 * The ID of the truncated endpoint.
	 * Used when this mark is the inner endpoint of a redundant move chain.
	 */
	truncatedEndpointForInner?: ChangeAtomId;
}

interface MoveEffectWithBasis extends MoveEffect {
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

export interface MovePartition {
	id: MoveId;

	// Undefined means the partition is the same size as the input.
	count?: number;
	replaceWith?: Mark[];
	modifyAfter?: TaggedChange<NodeId>;
}

export function setMoveEffect(
	moveEffects: MoveEffectTable,
	target: CrossFieldTarget,
	revision: RevisionTag | undefined,
	id: MoveId,
	count: number,
	effect: MoveEffect,
	invalidate: boolean = true,
): void {
	(effect as MoveEffectWithBasis).basis = id;
	moveEffects.set(target, revision, id, count, effect, invalidate);
}

export function getMoveEffect(
	moveEffects: MoveEffectTable,
	target: CrossFieldTarget,
	revision: RevisionTag | undefined,
	id: MoveId,
	count: number,
	addDependency: boolean = true,
): RangeQueryResult<ChangeAtomId, MoveEffect> {
	const result = moveEffects.get(target, revision, id, count, addDependency);
	assert(result.length === count, "Queried range has multiple values");
	return result.value !== undefined
		? { ...result, value: adjustMoveEffectBasis(result.value as MoveEffectWithBasis, id) }
		: result;
}

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

function adjustMoveEffectBasis(effect: MoveEffectWithBasis, newBasis: MoveId): MoveEffect {
	if (effect.basis === newBasis) {
		return effect;
	}

	const adjusted = { ...effect, basis: newBasis };
	const basisShift = newBasis - effect.basis;
	assert(basisShift > 0, 0x812 /* Expected basis shift to be positive */);

	if (effect.endpoint !== undefined) {
		adjusted.endpoint = adjustChangeAtomId(effect.endpoint, basisShift);
	}

	if (effect.truncatedEndpoint !== undefined) {
		adjusted.truncatedEndpoint = adjustChangeAtomId(effect.truncatedEndpoint, basisShift);
	}

	if (effect.truncatedEndpointForInner !== undefined) {
		adjusted.truncatedEndpointForInner = adjustChangeAtomId(
			effect.truncatedEndpointForInner,
			basisShift,
		);
	}

	if (effect.movedEffect !== undefined) {
		const [_mark1, mark2] = splitMarkEffect(effect.movedEffect, basisShift);
		adjusted.movedEffect = mark2;
	}

	return adjusted;
}

export function splitMarkForMoveEffects(mark: Mark, effects: MoveEffectTable): Mark[] {
	const length = getFirstMoveEffectLength(mark, mark.count, effects);
	return length < mark.count ? splitMark(mark, length) : [mark];
}

function getFirstMoveEffectLength(
	markEffect: MarkEffect,
	count: number,
	effects: MoveEffectTable,
): number {
	if (isMoveMark(markEffect)) {
		return getMoveEffect(
			effects,
			getCrossFieldTargetFromMove(markEffect),
			markEffect.revision,
			markEffect.id,
			count,
		).length;
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

function adjustChangeAtomId(id: ChangeAtomId, shift: number): ChangeAtomId {
	return {
		...id,
		localId: brand(id.localId + shift),
	};
}
