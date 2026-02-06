/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { unreachableCase } from "@fluidframework/core-utils/internal";

import {
	makeChangeAtomId,
	type ChangesetLocalId,
	type RevisionReplacer,
	type RevisionTag,
} from "../../core/index.js";
import type { Mutable } from "../../util/index.js";

import { MarkListFactory } from "./markListFactory.js";
import {
	type Attach,
	type Changeset,
	type Detach,
	type HasMoveId,
	type HasRevisionTag,
	type Mark,
	type MarkEffect,
	NoopMarkType,
} from "./types.js";

export function replaceRevisions(changeset: Changeset, replacer: RevisionReplacer): Changeset {
	const updatedMarks = new MarkListFactory();
	for (const mark of changeset) {
		const updatedMark = updateMark(mark, replacer);
		updatedMarks.push(updatedMark);
	}

	return updatedMarks.list;
}

function updateMark(mark: Mark, replacer: RevisionReplacer): Mark {
	const updatedMark = { ...replaceEffectRevisions(mark, mark.count, replacer) };
	if (mark.cellId !== undefined) {
		updatedMark.cellId = replacer.getUpdatedAtomId(mark.cellId, mark.count);
	}

	if (mark.changes !== undefined) {
		updatedMark.changes = replacer.getUpdatedAtomId(mark.changes, mark.count);
	}

	return updatedMark;
}

function replaceEffectRevisions<TMark extends MarkEffect>(
	mark: TMark,
	count: number,
	replacer: RevisionReplacer,
): TMark {
	const type = mark.type;
	switch (type) {
		case NoopMarkType: {
			return mark;
		}
		case "Attach": {
			return updateRevisionAndId(mark as TMark & Attach, count, replacer);
		}

		case "Detach": {
			return replaceDetachRevisions<TMark & Detach>(mark as Detach & TMark, count, replacer);
		}
		case "Rename": {
			return {
				...mark,
				idOverride: replacer.getUpdatedAtomId(mark.idOverride, count),
			};
		}
		default: {
			unreachableCase(type);
		}
	}
}

function replaceDetachRevisions<TDetach extends Detach>(
	detach: TDetach,
	count: number,
	replacer: RevisionReplacer,
): TDetach {
	const updated = updateRevisionAndId(detach, count, replacer) as Mutable<TDetach>;
	if (updated.cellRename !== undefined) {
		updated.cellRename = replacer.getUpdatedAtomId(updated.cellRename, count);
	}

	if (updated.detachCellId !== undefined) {
		updated.detachCellId = replacer.getUpdatedAtomId(updated.detachCellId, count);
	}

	return updated;
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
