/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Delta, TaggedChange, tagChange, RevisionTag } from "../../core";
import { Brand, brand, JsonCompatibleReadOnly, Mutable } from "../../util";
import {
	ToDelta,
	FieldChangeRebaser,
	FieldChangeEncoder,
	FieldEditor,
	ChangesetLocalId,
	CrossFieldManager,
	CrossFieldTarget,
} from "../modular-schema";
import { populateChildModifications } from "../deltaUtils";

export type DetachedRangeId = Brand<number, "DetachedRangeId">;

export interface Cell<
	TDeepChange,
	TEditor extends FieldEditor<TDeepChange> = FieldEditor<TDeepChange>,
> {
	rebaser: FieldChangeRebaser<CellChange<TDeepChange>>;
	encoder: FieldChangeEncoder<CellChange<TDeepChange>>;
	editor: TEditor;
	intoDelta(change: CellChange<TDeepChange>, deltaFromChild: ToDelta): Delta.MarkList;

	/**
	 * Returns whether this change is empty, meaning that it represents no modifications to the field
	 * and could be removed from the ModularChangeset tree without changing its behavior.
	 */
	isEmpty(change: CellChange<TDeepChange>): boolean;
}

export interface ShallowChange {
	/**
	 * The source for the content that will be in the cell after this change.
	 * If undefined, the cell will be empty after this change.
	 */
	newContentSrc?: DetachedRangeId;

	/**
	 * The destination for the content that was in the cell before this change.
	 * If undefined, the cell was be empty before this change.
	 */
	oldContentDst?: DetachedRangeId;
}

export interface CellChange<TDeepChange> {
	/**
	 * If defined, specifies the new content for the cell.
	 */
	shallow?: ShallowChange;

	/**
	 * Changes internal to the content that was in the cell before this change.
	 */
	deep?: TDeepChange;
}

export function encodeForJson<TDeepChange>(
	formatVersion: number,
	change: CellChange<TDeepChange>,
	encodeChild: (change: TDeepChange) => JsonCompatibleReadOnly,
): JsonCompatibleReadOnly {
	const result: Mutable<CellChange<JsonCompatibleReadOnly>> & JsonCompatibleReadOnly = {};
	if (change.shallow !== undefined) {
		result.shallow = change.shallow;
	}
	if (change.deep !== undefined) {
		result.deep = encodeChild(change.deep);
	}
	return result;
}

export function decodeJson<TDeepChange>(
	formatVersion: number,
	change: JsonCompatibleReadOnly,
	decodeChild: (change: JsonCompatibleReadOnly) => TDeepChange,
): CellChange<TDeepChange> {
	const encoded = change as Mutable<CellChange<JsonCompatibleReadOnly>>;
	const result: Mutable<CellChange<TDeepChange>> = {};
	if (encoded.shallow !== undefined) {
		result.shallow = encoded.shallow;
	}
	if (encoded.deep !== undefined) {
		result.deep = decodeChild(encoded.deep);
	}
	return result;
}

export function intoDelta<TDeepChange>(
	change: CellChange<TDeepChange>,
	deltaFromDeep: (child: TDeepChange) => Delta.Modify,
): Delta.MarkList {
	if (change.shallow === undefined) {
		return change.deep === undefined ? [] : [deltaFromDeep(change.deep)];
	}

	const marks: Delta.Mark[] = [];
	if (change.shallow.oldContentDst !== undefined) {
		const remove: Mutable<Delta.MoveOut> = {
			type: Delta.MarkType.MoveOut,
			count: 1,
			// Is that ok?
			moveId: brand(change.shallow.oldContentDst),
		};
		if (change.deep === undefined) {
			const modify = deltaFromDeep(change.deep);
			populateChildModifications(modify, remove);
		}
		marks.push(remove);
	}
	if (change.shallow.newContentSrc !== undefined) {
		const moveIn: Delta.MoveIn = {
			type: Delta.MarkType.MoveIn,
			count: 1,
			// Is that ok?
			moveId: brand(change.shallow.newContentSrc),
		};
		marks.push(moveIn);
	}
	return marks;
}

export function isEmpty(change: CellChange<unknown>): boolean {
	return change.shallow === undefined && change.deep === undefined;
}

export function editCellContent<TDeepChange>(deep: TDeepChange): CellChange<TDeepChange> {
	return { deep };
}

export function clearContent(oldContentDst: DetachedRangeId): CellChange<never> {
	return { shallow: { oldContentDst } };
}

export function setContent(newContentSrc: DetachedRangeId): CellChange<never> {
	return { shallow: { newContentSrc } };
}

export function replaceContent(
	oldContentDst: DetachedRangeId,
	newContentSrc: DetachedRangeId,
): CellChange<never> {
	return { shallow: { oldContentDst, newContentSrc } };
}

export function compose<TDeepChange>(
	changes: TaggedChange<CellChange<TDeepChange>>[],
	composeDeep: (changes: TaggedChange<TDeepChange>[]) => TDeepChange,
	genId: () => DetachedRangeId,
	crossFieldManager: CrossFieldManager,
): CellChange<TDeepChange> {
	const composed: CellChange<TDeepChange> = {};
	let shallow: ShallowChange | undefined;
	let deepSource: DetachedRangeId | undefined;
	let deepSourceRevision: RevisionTag | undefined;
	let deepChanges: TaggedChange<TDeepChange>[] = [];
	for (const { change, revision } of changes) {
		if (change.deep !== undefined) {
			const taggedChange = tagChange(change.deep, revision);
			deepChanges.push(taggedChange);
		}

		if (change.shallow !== undefined) {
			if (deepChanges.length > 0) {
				const composedDeep = composeDeep(deepChanges);
				if (deepSource === undefined) {
					// The changes so far all apply to the content present in the cell before the composed changeset
					composed.deep = composedDeep;
				} else {
					// The changes since the last shallow change apply to the content present in the cell after the
					// last shallow change.
					// Those changes should be represented in the source cell of the new content.
					crossFieldManager.getOrCreate(
						CrossFieldTarget.Destination,
						deepSourceRevision,
						// Can we make the type system happy here?
						deepSource as unknown as ChangesetLocalId,
						composedDeep,
						true,
					);
				}
				deepChanges = [];
				deepSource = change.shallow.newContentSrc;
				deepSourceRevision = revision;
			}
			if (shallow === undefined) {
				shallow = { ...change.shallow };
			}

			if (change.shallow.newContentSrc !== undefined) {
				shallow.newContentSrc = change.shallow.newContentSrc;
			} else {
				delete shallow.newContentSrc;
			}
		}
	}

	if (shallow !== undefined) {
		composed.shallow = shallow;
	}
	return composed;
}

export function invert<TDeepChange>(
	{ change, revision }: TaggedChange<CellChange<TDeepChange>>,
	invertDeep: (change: TDeepChange) => TDeepChange,
	genId: () => DetachedRangeId,
	crossFieldManager: CrossFieldManager,
): CellChange<TDeepChange> {
	const inverted: CellChange<TDeepChange> = {};
	if (change.shallow !== undefined) {
		inverted.shallow = {
			newContentSrc: change.shallow.oldContentDst,
			oldContentDst: change.shallow.newContentSrc,
		};
		// We need to put on this changeset the inverse of any deep changes that were applied to the source of the
		// original content.
		// TODO: implement amendInverse.
		crossFieldManager.get(
			CrossFieldTarget.Source,
			revision,
			// Can we make the type system happy here?
			change.shallow.newContentSrc as unknown as ChangesetLocalId,
			true,
		);
		if (change.deep !== undefined) {
			// The inverse of the changes to the original content should reside where that content was sent.
			crossFieldManager.getOrCreate(
				CrossFieldTarget.Destination,
				revision,
				// Can we make the type system happy here?
				change.shallow.oldContentDst as unknown as ChangesetLocalId,
				invertDeep(change.deep),
				true,
			);
		}
	} else if (change.deep !== undefined) {
		inverted.deep = invertDeep(change.deep);
	}
	return inverted;
}

export function rebase<TDeepChange>(
	change: CellChange<TDeepChange>,
	over: TaggedChange<CellChange<TDeepChange>>,
	rebaseDeep: (
		change: TDeepChange | undefined,
		baseChange: TDeepChange | undefined,
	) => TDeepChange | undefined,
	genId: () => DetachedRangeId,
	crossFieldManager: CrossFieldManager,
): CellChange<TDeepChange> {
	const deep = rebaseDeep(change.deep, over.change.deep);
	if (over.change.shallow !== undefined) {
		if (deep !== undefined) {
			// Since the content has been replaced by the concurrent change, the deep changes to it should
			// reside at its new location.
			crossFieldManager.getOrCreate(
				CrossFieldTarget.Destination,
				over.revision,
				// Can we make the type system happy here?
				over.change.shallow.oldContentDst as unknown as ChangesetLocalId,
				deep,
				true,
			);
		}
		if (change.shallow !== undefined) {
			const shallow: ShallowChange = { ...change.shallow };
			if (over.change.shallow.newContentSrc !== undefined) {
				shallow.oldContentDst = change.shallow.oldContentDst ?? genId();
				// Any deep changes (within this revision) that apply to the content put in place by `over` should
				// be represented as part of the change on this cell.
				// TODO: implement amendRebase.
				crossFieldManager.get(
					CrossFieldTarget.Source,
					over.revision,
					// Can we make the type system happy here?
					over.change.shallow.newContentSrc as unknown as ChangesetLocalId,
					true,
				);
			} else {
				delete shallow.oldContentDst;
			}
			return { shallow };
		}
		return {};
	}

	return deep !== undefined ? { deep } : {};
}
