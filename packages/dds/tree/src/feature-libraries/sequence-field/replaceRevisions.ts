/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { unreachableCase } from "@fluidframework/core-utils/internal";
import { type RevisionTag, replaceAtomRevisions } from "../../core/index.js";
import { MarkListFactory } from "./markListFactory.js";
import {
	type Changeset,
	type Detach,
	type HasMoveFields,
	type HasRevisionTag,
	type Mark,
	type MarkEffect,
	NoopMarkType,
	type Rename,
} from "./types.js";
import type { MoveMarkEffect } from "./helperTypes.js";
import { isDetach, isRename } from "./utils.js";

export function replaceRevisions(
	changeset: Changeset,
	revisionsToReplace: Set<RevisionTag | undefined>,
	newRevision: RevisionTag | undefined,
): Changeset {
	const updatedMarks = new MarkListFactory();
	for (const mark of changeset) {
		const updatedMark = updateMark(mark, revisionsToReplace, newRevision);
		updatedMarks.push(updatedMark);
	}

	return updatedMarks.list;
}

function updateMark(
	mark: Mark,
	revisionsToReplace: Set<RevisionTag | undefined>,
	newRevision: RevisionTag | undefined,
): Mark {
	const updatedMark = { ...updateEffect(mark, revisionsToReplace, newRevision) };
	if (mark.cellId !== undefined) {
		updatedMark.cellId = replaceAtomRevisions(mark.cellId, revisionsToReplace, newRevision);
	}

	if (mark.changes !== undefined) {
		updatedMark.changes = replaceAtomRevisions(mark.changes, revisionsToReplace, newRevision);
	}

	return updatedMark;
}

function updateEffect<TMark extends MarkEffect>(
	input: TMark,
	revisionsToReplace: Set<RevisionTag | undefined>,
	newRevision: RevisionTag | undefined,
): TMark {
	const mark =
		isDetach(input) || isRename(input)
			? updateIdOverride(input, revisionsToReplace, newRevision)
			: input;
	const type = mark.type;
	switch (type) {
		case "Rename":
		case NoopMarkType:
			return mark;
		case "AttachAndDetach":
			return {
				...mark,
				attach: updateEffect(mark.attach, revisionsToReplace, newRevision),
				detach: updateEffect(mark.detach, revisionsToReplace, newRevision),
			};
		case "MoveIn":
		case "MoveOut":
			return updateMoveEffect<TMark & MoveMarkEffect>(
				// For some reason, TypeScript is not able to infer that `mark` cannot be a `NoopMark` here.
				mark as MoveMarkEffect,
				revisionsToReplace,
				newRevision,
			);
		case "Insert":
		case "Remove":
			return updateRevision<TMark & HasRevisionTag>(mark, revisionsToReplace, newRevision);
		default:
			unreachableCase(type);
	}
}

function updateIdOverride<TEffect extends Detach | Rename>(
	effect: TEffect,
	revisionsToReplace: Set<RevisionTag | undefined>,
	newRevision: RevisionTag | undefined,
): TEffect {
	if (effect.idOverride !== undefined) {
		const idOverride = replaceAtomRevisions(
			effect.idOverride,
			revisionsToReplace,
			newRevision,
		);
		return { ...effect, idOverride };
	} else {
		return effect;
	}
}

function updateMoveEffect<TEffect extends HasMoveFields>(
	effect: TEffect,
	revisionsToReplace: Set<RevisionTag | undefined>,
	newRevision: RevisionTag | undefined,
): TEffect {
	return effect.finalEndpoint !== undefined
		? updateRevision(
				{
					...effect,
					finalEndpoint: updateRevision(effect.finalEndpoint, revisionsToReplace, newRevision),
				},
				revisionsToReplace,
				newRevision,
			)
		: updateRevision(effect, revisionsToReplace, newRevision);
}

function updateRevision<T extends HasRevisionTag>(
	input: T,
	revisionsToReplace: Set<RevisionTag | undefined>,
	newRevision: RevisionTag | undefined,
): T {
	return revisionsToReplace.has(input.revision) ? withRevision(input, newRevision) : input;
}

function withRevision<T extends HasRevisionTag>(
	input: T,
	revision: RevisionTag | undefined,
): T {
	const updated = { ...input, revision };
	if (revision === undefined) {
		delete updated.revision;
	}

	return updated;
}
