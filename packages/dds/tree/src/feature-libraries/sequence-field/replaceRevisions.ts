/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { unreachableCase } from "@fluidframework/core-utils/internal";

import {
	makeChangeAtomId,
	type ChangesetLocalId,
	type RevisionTag,
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
import type { RevisionReplacer } from "../modular-schema/index.js";

export function replaceRevisions(changeset: Changeset, replacer: RevisionReplacer): Changeset {
	const updatedMarks = new MarkListFactory();
	for (const mark of changeset) {
		const updatedMark = updateMark(mark, replacer);
		updatedMarks.push(updatedMark);
	}

	return updatedMarks.list;
}

function updateMark(mark: Mark, replacer: RevisionReplacer): Mark {
	const updatedMark = { ...updateEffect(mark, replacer) };
	if (mark.cellId !== undefined) {
		updatedMark.cellId = replacer.replaceAtomId(mark.cellId);
	}

	if (mark.changes !== undefined) {
		updatedMark.changes = replacer.replaceAtomId(mark.changes);
	}

	return updatedMark;
}

function updateEffect<TMark extends MarkEffect>(
	input: TMark,
	replacer: RevisionReplacer,
): TMark {
	const mark = isDetach(input) || isRename(input) ? updateIdOverride(input, replacer) : input;
	const type = mark.type;
	switch (type) {
		case "Rename":
		case NoopMarkType:
			return mark;
		case "AttachAndDetach":
			return {
				...mark,
				attach: updateEffect(mark.attach, replacer),
				detach: updateEffect(mark.detach, replacer),
			};
		case "MoveIn":
		case "MoveOut":
			return updateMoveEffect<TMark & MoveMarkEffect>(
				// For some reason, TypeScript is not able to infer that `mark` cannot be a `NoopMark` here.
				mark as MoveMarkEffect,
				replacer,
			);
		case "Insert":
		case "Remove":
			return updateRevisionAndId(mark as (TMark & Insert) | (TMark & Remove), replacer);
		default:
			unreachableCase(type);
	}
}

function updateIdOverride<TEffect extends Detach | Rename>(
	effect: TEffect,
	replacer: RevisionReplacer,
): TEffect {
	if (effect.idOverride !== undefined) {
		const idOverride = replacer.replaceAtomId(effect.idOverride);
		return { ...effect, idOverride };
	} else {
		return effect;
	}
}

function updateMoveEffect<TEffect extends HasMoveFields>(
	effect: TEffect,
	replacer: RevisionReplacer,
): TEffect {
	return effect.finalEndpoint !== undefined
		? updateRevisionAndId(
				{
					...effect,
					finalEndpoint: replacer.replaceAtomId(effect.finalEndpoint),
				},
				replacer,
			)
		: updateRevisionAndId(effect, replacer);
}

function updateRevisionAndId<T extends HasRevisionTag & HasMoveId>(
	input: T,
	replacer: RevisionReplacer,
): T {
	if (!replacer.isOldRevision(input.revision)) {
		return input;
	}
	const newAtom = replacer.replaceAtomId(makeChangeAtomId(input.id, input.revision));
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
