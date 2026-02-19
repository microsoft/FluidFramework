/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { unreachableCase } from "@fluidframework/core-utils/internal";

import {
	type ChangesetLocalId,
	type RevisionReplacer,
	type RevisionTag,
	makeChangeAtomId,
} from "../../core/index.js";

import type { MoveMarkEffect } from "./helperTypes.js";
import { MarkListFactory } from "./markListFactory.js";
import {
	type Changeset,
	type Detach,
	type HasMoveFields,
	type HasMoveId,
	type HasRevisionTag,
	type Insert,
	type Mark,
	type MarkEffect,
	NoopMarkType,
	type Remove,
	type Rename,
} from "./types.js";
import { isDetach, isRename } from "./utils.js";

export function replaceRevisions(changeset: Changeset, replacer: RevisionReplacer): Changeset {
	const updatedMarks = new MarkListFactory();
	for (const mark of changeset) {
		const updatedMark = updateMark(mark, replacer);
		updatedMarks.push(updatedMark);
	}

	return updatedMarks.list;
}

function updateMark(mark: Mark, replacer: RevisionReplacer): Mark {
	const updatedMark = { ...updateEffect(mark, mark.count, replacer) };
	if (mark.cellId !== undefined) {
		updatedMark.cellId = replacer.getUpdatedAtomId(mark.cellId, mark.count);
	}

	if (mark.changes !== undefined) {
		updatedMark.changes = replacer.getUpdatedAtomId(mark.changes);
	}

	return updatedMark;
}

function updateEffect<TMark extends MarkEffect>(
	input: TMark,
	count: number,
	replacer: RevisionReplacer,
): TMark {
	const mark =
		isDetach(input) || isRename(input) ? updateIdOverride(input, count, replacer) : input;
	const type = mark.type;
	switch (type) {
		case "Rename":
		case NoopMarkType: {
			return mark;
		}
		case "AttachAndDetach": {
			return {
				...mark,
				attach: updateEffect(mark.attach, count, replacer),
				detach: updateEffect(mark.detach, count, replacer),
			};
		}
		case "MoveIn":
		case "MoveOut": {
			return updateMoveEffect<TMark & MoveMarkEffect>(
				// For some reason, TypeScript is not able to infer that `mark` cannot be a `NoopMark` here.
				mark as MoveMarkEffect,
				count,
				replacer,
			);
		}
		case "Insert":
		case "Remove": {
			return updateRevisionAndId(mark as (TMark & Insert) | (TMark & Remove), count, replacer);
		}
		default: {
			unreachableCase(type);
		}
	}
}

function updateIdOverride<TEffect extends Detach | Rename>(
	effect: TEffect,
	count: number,
	replacer: RevisionReplacer,
): TEffect {
	if (effect.idOverride === undefined) {
		return effect;
	}
	const idOverride = replacer.getUpdatedAtomId(effect.idOverride, count);
	return { ...effect, idOverride };
}

function updateMoveEffect<TEffect extends HasMoveFields>(
	effect: TEffect,
	count: number,
	replacer: RevisionReplacer,
): TEffect {
	return effect.finalEndpoint === undefined
		? updateRevisionAndId(effect, count, replacer)
		: updateRevisionAndId(
				{
					...effect,
					finalEndpoint: replacer.getUpdatedAtomId(effect.finalEndpoint, count),
				},
				count,
				replacer,
			);
}

function updateRevisionAndId<T extends HasRevisionTag & HasMoveId>(
	input: T,
	count: number,
	replacer: RevisionReplacer,
): T {
	if (!replacer.isObsolete(input.revision)) {
		return input;
	}
	const newAtom = replacer.getUpdatedAtomId(makeChangeAtomId(input.id, input.revision), count);
	return withRevisionAndId(input, newAtom.revision, newAtom.localId);
}

function withRevisionAndId<T extends HasRevisionTag>(
	input: T,
	revision: RevisionTag | undefined,
	id: ChangesetLocalId,
): T {
	const updated = { ...input, revision, id };
	if (revision === undefined) {
		delete updated.revision;
	}

	return updated;
}
