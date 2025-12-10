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
	type HasRevisionTag,
	type Mark,
	type MarkEffect,
	NoopMarkType,
} from "./types.js";
import type { Mutable } from "../../util/index.js";

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
	const updatedMark = { ...replaceEffectRevisions(mark, revisionsToReplace, newRevision) };
	if (mark.cellId !== undefined) {
		updatedMark.cellId = replaceAtomRevisions(mark.cellId, revisionsToReplace, newRevision);
	}

	if (mark.changes !== undefined) {
		updatedMark.changes = replaceAtomRevisions(mark.changes, revisionsToReplace, newRevision);
	}

	return updatedMark;
}

function replaceEffectRevisions<TMark extends MarkEffect>(
	mark: TMark,
	revisionsToReplace: Set<RevisionTag | undefined>,
	newRevision: RevisionTag | undefined,
): TMark {
	const type = mark.type;
	switch (type) {
		case NoopMarkType:
			return mark;
		case "Insert":
			return replaceRevision<TMark & HasRevisionTag>(mark, revisionsToReplace, newRevision);

		case "Remove":
			return replaceDetachRevisions<TMark & Detach>(
				mark as Detach & TMark,
				revisionsToReplace,
				newRevision,
			);
		case "Rename":
			return {
				...mark,
				idOverride: replaceAtomRevisions(mark.idOverride, revisionsToReplace, newRevision),
			};
		default:
			unreachableCase(type);
	}
}

function replaceDetachRevisions<TDetach extends Detach>(
	detach: TDetach,
	revisionsToReplace: Set<RevisionTag | undefined>,
	newRevision: RevisionTag | undefined,
): TDetach {
	const updated = replaceRevision(detach, revisionsToReplace, newRevision) as Mutable<TDetach>;
	if (updated.cellRename !== undefined) {
		updated.cellRename = replaceAtomRevisions(
			updated.cellRename,
			revisionsToReplace,
			newRevision,
		);
	}

	if (updated.detachCellId !== undefined) {
		updated.detachCellId = replaceAtomRevisions(
			updated.detachCellId,
			revisionsToReplace,
			newRevision,
		);
	}
	return updated;
}

function replaceRevision<T extends HasRevisionTag>(
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
