/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { unreachableCase } from "@fluidframework/core-utils/internal";
import { RevisionTag } from "../../core/index.js";
import { MarkListFactory } from "./markListFactory.js";
import { Changeset, HasRevisionTag, Mark, MarkEffect, NoopMarkType } from "./types.js";

export function replaceRevisions(
	changeset: Changeset,
	revisionsToReplace: Set<RevisionTag | undefined>,
	newRevision: RevisionTag,
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
	newRevision: RevisionTag,
): Mark {
	const updatedMark = updateEffect(mark, revisionsToReplace, newRevision);
	if (updatedMark.cellId !== undefined && revisionsToReplace.has(updatedMark.cellId.revision)) {
		updatedMark.cellId = { ...updatedMark.cellId, revision: newRevision };
	}

	return updatedMark;
}

function updateEffect<TMark extends MarkEffect>(
	mark: TMark,
	revisionsToReplace: Set<RevisionTag | undefined>,
	newRevision: RevisionTag,
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
	newRevision: RevisionTag,
): TMark {
	return revisionsToReplace.has(effect.revision) ? { ...effect, revision: newRevision } : effect;
}
