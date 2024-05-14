/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { unreachableCase } from "@fluidframework/core-utils/internal";
import { RevisionTag, replaceAtomRevisions } from "../../core/index.js";
import { MarkListFactory } from "./markListFactory.js";
import { Changeset, HasRevisionTag, Mark, MarkEffect, NoopMarkType } from "./types.js";

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
	mark: TMark,
	revisionsToReplace: Set<RevisionTag | undefined>,
	newRevision: RevisionTag | undefined,
): TMark {
	const type = mark.type;
	switch (type) {
		case NoopMarkType:
			return mark;
		case "AttachAndDetach":
			return {
				...mark,
				attach: updateEffect(mark.attach, revisionsToReplace, newRevision),
				detach: updateEffect(mark.detach, revisionsToReplace, newRevision),
			};
		case "Insert":
		case "MoveIn":
		case "MoveOut":
		case "Remove":
			return updateEffectRevision(mark, revisionsToReplace, newRevision);
		default:
			unreachableCase(type);
	}
}

function updateEffectRevision<TMark extends MarkEffect & HasRevisionTag>(
	effect: TMark,
	revisionsToReplace: Set<RevisionTag | undefined>,
	newRevision: RevisionTag | undefined,
): TMark {
	return revisionsToReplace.has(effect.revision)
		? effectWithRevision(effect, newRevision)
		: effect;
}

function effectWithRevision<TEffect extends MarkEffect & HasRevisionTag>(
	effect: TEffect,
	revision: RevisionTag | undefined,
): TEffect {
	const updated = { ...effect, revision };
	if (revision === undefined) {
		delete updated.revision;
	}

	return updated;
}
