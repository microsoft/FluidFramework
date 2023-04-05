/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert, IsoBuffer } from "@fluidframework/common-utils";
import {
	ChangeEncoder,
	FieldKindIdentifier,
	Delta,
	JsonableTree,
	ITreeCursor,
	TaggedChange,
	ITreeCursorSynchronous,
	tagChange,
	TreeSchemaIdentifier,
	FieldSchema,
	RevisionTag,
} from "../../core";
import { Brand, brand, fail, JsonCompatible, JsonCompatibleReadOnly, Mutable } from "../../util";
import { singleTextCursor, jsonableTreeFromCursor } from "../treeTextCursor";
import {
	FieldKind,
	Multiplicity,
	allowsTreeSchemaIdentifierSuperset,
	ToDelta,
	FieldChangeRebaser,
	FieldChangeHandler,
	NodeChangeComposer,
	NodeChangeInverter,
	NodeChangeRebaser,
	NodeChangeset,
	FieldChangeEncoder,
	NodeChangeDecoder,
	NodeChangeEncoder,
	FieldEditor,
	referenceFreeFieldChangeRebaser,
	NodeReviver,
	isolatedFieldChangeRebaser,
	ChangesetLocalId,
	RevisionMetadataSource,
	IdAllocator,
	CrossFieldManager,
	CrossFieldTarget,
} from "../modular-schema";

export interface Cell<
	TContentChange,
	TEditor extends FieldEditor<TContentChange> = FieldEditor<TContentChange>,
> {
	rebaser: FieldChangeRebaser<CellChange<TContentChange>>;
	encoder: FieldChangeEncoder<CellChange<TContentChange>>;
	editor: TEditor;
	intoDelta(change: CellChange<TContentChange>, deltaFromChild: ToDelta): Delta.MarkList;

	/**
	 * Returns whether this change is empty, meaning that it represents no modifications to the field
	 * and could be removed from the ModularChangeset tree without changing its behavior.
	 */
	isEmpty(change: CellChange<TContentChange>): boolean;
}

export interface ShallowChange {
	/**
	 * The source for the content that will be in the cell after this change.
	 * If undefined, the cell will be empty after this change.
	 */
	newContentSrc?: ChangesetLocalId;

	/**
	 * The destination for the content that was in the cell before this change.
	 * If undefined, the cell was be empty before this change.
	 */
	oldContentDst?: ChangesetLocalId;
}

export interface CellChange<TContentChange> {
	/**
	 * If defined, specifies the new content for the cell.
	 */
	shallow?: ShallowChange;

	/**
	 * Changes internal to the content that was in the cell before this change.
	 */
	deep?: TContentChange;
}

export interface CellRebaser<TContentChange> {
	compose(
		changes: TaggedChange<CellChange<TContentChange>>[],
		composeDeep: (changes: TaggedChange<TContentChange>[]) => TContentChange,
		genId: IdAllocator,
		crossFieldManager: CrossFieldManager,
		revisionMetadata: RevisionMetadataSource,
	): CellChange<TContentChange>;

	invert(
		change: TaggedChange<CellChange<TContentChange>>,
		invertDeep: (change: TContentChange) => TContentChange,
		reviver: NodeReviver,
		genId: IdAllocator,
		crossFieldManager: CrossFieldManager,
	): CellChange<TContentChange>;

	rebase(
		change: CellChange<TContentChange>,
		over: TaggedChange<CellChange<TContentChange>>,
		rebaseDeep: (
			change: TContentChange | undefined,
			baseChange: TContentChange | undefined,
		) => TContentChange | undefined,
		genId: IdAllocator,
		crossFieldManager: CrossFieldManager,
		revisionMetadata: RevisionMetadataSource,
	): CellChange<TContentChange>;
}

type ContentChange = Brand<unknown, "ContentChange">;
type Change = CellChange<ContentChange>;
const cellRebaser: CellRebaser<ContentChange> = {
	compose: (
		changes: TaggedChange<Change>[],
		composeDeep: (changes: TaggedChange<ContentChange>[]) => ContentChange,
		genId: IdAllocator,
		crossFieldManager: CrossFieldManager,
		revisionMetadata: RevisionMetadataSource,
	): Change => {
		const composed: Change = {};
		let shallow: ShallowChange | undefined;
		let deepSource: ChangesetLocalId | undefined;
		let deepSourceRevision: RevisionTag | undefined;
		let deepChanges: TaggedChange<ContentChange>[] = [];
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
							deepSource,
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
	},

	invert: (
		{ change, revision }: TaggedChange<Change>,
		invertDeep: (change: ContentChange) => ContentChange,
		reviver: NodeReviver,
		genId: IdAllocator,
		crossFieldManager: CrossFieldManager,
	): Change => {
		const inverted: Change = {};
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
				change.shallow.newContentSrc,
				true,
			);
			if (change.deep !== undefined) {
				// The inverse of the changes to the original content should reside where that content was sent.
				crossFieldManager.getOrCreate(
					CrossFieldTarget.Destination,
					revision,
					change.shallow.oldContentDst,
					invertDeep(change.deep),
					true,
				);
			}
		} else if (change.deep !== undefined) {
			inverted.deep = invertDeep(change.deep);
		}
		return inverted;
	},

	rebase: (
		change: Change,
		over: TaggedChange<Change>,
		rebaseDeep: (
			change: ContentChange | undefined,
			baseChange: ContentChange | undefined,
		) => ContentChange | undefined,
		genId: IdAllocator,
		crossFieldManager: CrossFieldManager,
		revisionMetadata: RevisionMetadataSource,
	): Change => {
		if (over.change.shallow !== undefined) {
			if (change.deep !== undefined) {
				const rebasedDeep = rebaseDeep(change.deep, over.change.deep);
				if (rebasedDeep !== undefined) {
					// Since the content has been replaced by the concurrent change, the deep changes to it should
					// reside at its new location.
					crossFieldManager.getOrCreate(
						CrossFieldTarget.Destination,
						over.revision,
						over.change.shallow.oldContentDst,
						rebasedDeep,
						true,
					);
				}
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
						over.change.shallow.newContentSrc,
						true,
					);
				} else {
					delete shallow.oldContentDst;
				}
				return { shallow };
			}
			return {};
		}

		if (change.deep !== undefined) {
			const deep = rebaseDeep(change.deep, over.change.deep);
			if (deep !== undefined) {
				return { deep };
			}
		}
		return {};
	},
};

export function makeCellRebaser<TContentChange>(): CellRebaser<TContentChange> {
	return cellRebaser as CellRebaser<TContentChange>;
}

export interface CellChangeEncoder<TContentChange> {}
