/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/common-utils";
import { Delta, TaggedChange, RevisionTag, FieldKey } from "../core";
import { brand, JsonCompatibleReadOnly } from "../util";
import {
	FieldKind,
	Multiplicity,
	ToDelta,
	FieldChangeRebaser,
	NodeChangeComposer,
	NodeChangeInverter,
	NodeChangeRebaser,
	NodeChangeset,
	FieldChangeEncoder,
	NodeChangeDecoder,
	NodeChangeEncoder,
	FieldEditor,
	NodeReviver,
	IdAllocator,
	CrossFieldManager,
	DetachedFieldKeyAllocator,
	ChangesetLocalId,
} from "./modular-schema";
import { Cell } from "./cell";

export type OptionalChangeset = Cell.Change<NodeChangeset>;

function crossCellManagerFromCrossFieldManager(
	crossFieldManager: CrossFieldManager,
): Cell.CrossCellManager<NodeChangeset> {
	throw new Error("Not implemented");
}

const optionalChangeRebaser: FieldChangeRebaser<OptionalChangeset> = {
	compose: (
		changes: TaggedChange<OptionalChangeset>[],
		composeChild: NodeChangeComposer,
		genId: IdAllocator,
		crossFieldManager: CrossFieldManager,
	): OptionalChangeset => {
		return Cell.compose(
			changes,
			composeChild,
			crossCellManagerFromCrossFieldManager(crossFieldManager),
		);
	},

	amendCompose: (
		composedChange: OptionalChangeset,
		composeChild: NodeChangeComposer,
		genId: IdAllocator,
		crossFieldManager: CrossFieldManager,
	): OptionalChangeset => {
		throw new Error("Not implemented");
	},

	invert: (
		{ revision, change }: TaggedChange<OptionalChangeset>,
		invertChild: NodeChangeInverter,
		reviver: NodeReviver,
		genId: IdAllocator,
		crossFieldManager: CrossFieldManager,
	): OptionalChangeset => {
		return Cell.invert(
			change,
			(deep) => invertChild(deep, 0),
			crossCellManagerFromCrossFieldManager(crossFieldManager),
		);
	},

	amendInvert: (
		invertedChange: OptionalChangeset,
		originalRevision: RevisionTag | undefined,
		reviver: NodeReviver,
		genId: IdAllocator,
		crossFieldManager: CrossFieldManager,
	): OptionalChangeset => {
		throw new Error("Not implemented");
	},

	rebase: (
		change: OptionalChangeset,
		overTagged: TaggedChange<OptionalChangeset>,
		rebaseChild: NodeChangeRebaser,
		genId: IdAllocator,
		crossFieldManager: CrossFieldManager,
	): OptionalChangeset => {
		return Cell.rebase(
			change,
			overTagged.change,
			rebaseChild,
			crossCellManagerFromCrossFieldManager(crossFieldManager),
		);
	},

	amendRebase: (
		rebasedChange: OptionalChangeset,
		over: TaggedChange<OptionalChangeset>,
		rebaseChild: NodeChangeRebaser,
		genId: IdAllocator,
		crossFieldManager: CrossFieldManager,
	): OptionalChangeset => {
		throw new Error("Not implemented");
	},
};

export class OptionalFieldEditor implements FieldEditor<OptionalChangeset> {
	public constructor(
		private readonly idAllocator: IdAllocator,
		private readonly detachedFieldKeyAllocator: DetachedFieldKeyAllocator,
	) {}

	/**
	 * Creates a change which replaces the field with `newContent`
	 * @param newContent - the new content for the field
	 * @param wasEmpty - whether the field is empty when creating this change
	 */
	public set(
		newContent: FieldKey | undefined,
		wasEmpty: boolean,
	): { fieldChanges: OptionalChangeset; detachedRangeChanges: Map<FieldKey, OptionalChangeset> } {
		let fieldChanges: OptionalChangeset;
		const detachedRangeChanges = new Map<FieldKey, OptionalChangeset>();

		let newContentMoveId: ChangesetLocalId | undefined;
		if (newContent !== undefined) {
			newContentMoveId = this.idAllocator();
			const moveOut: Delta.MoveOut = {
				type: Delta.MarkType.MoveOut,
				moveId: brand(newContentMoveId),
				count: 1,
			};
			detachedRangeChanges.set(newContent, [moveOut]);
		}

		let oldContentMoveId: ChangesetLocalId | undefined;
		if (!wasEmpty) {
			oldContentMoveId = this.idAllocator();
			const oldRange = this.detachedFieldKeyAllocator();
			detachedRangeChanges.set(
				oldRange,
				Cell.insertContent(brand(oldRange), brand(oldContentMoveId)),
			);
		}

		if (newContent === undefined) {
			fieldChanges = wasEmpty ? {} : Cell.clearContent(brand(oldContentMoveId));
		} else {
			fieldChanges = wasEmpty
				? Cell.insertContent(brand(newContentMoveId))
				: Cell.replaceContent(brand(oldContentMoveId), brand(newContentMoveId));
		}
		return { fieldChanges, detachedRangeChanges };
	}

	public buildChildChange(index: number, childChange: NodeChangeset): OptionalChangeset {
		assert(index === 0, 0x404 /* Optional fields only support a single child node */);
		return Cell.editCellContent(childChange);
	}
}

const optionalFieldEncoder: FieldChangeEncoder<OptionalChangeset> = {
	encodeForJson: (
		formatVersion: number,
		change: OptionalChangeset,
		encodeChild: NodeChangeEncoder,
	) => Cell.encodeForJson(formatVersion, change, encodeChild),

	decodeJson: (
		formatVersion: number,
		change: JsonCompatibleReadOnly,
		decodeChild: NodeChangeDecoder,
	) => Cell.decodeJson(formatVersion, change, decodeChild),
};

/**
 * 0 or 1 items.
 */
export const optional: FieldKind<OptionalFieldEditor, Multiplicity.Optional> = new FieldKind(
	brand("Optional"),
	Multiplicity.Optional,
	{
		rebaser: optionalChangeRebaser,
		encoder: optionalFieldEncoder,
		editor: (idAllocator: IdAllocator, detachedFieldKeyAllocator: DetachedFieldKeyAllocator) =>
			new OptionalFieldEditor(idAllocator, detachedFieldKeyAllocator),

		intoDelta: (change: OptionalChangeset, deltaFromChild: ToDelta) =>
			Cell.intoDelta(change, deltaFromChild, moveIdFromCellId),

		isEmpty: (change: OptionalChangeset) => Cell.isEmpty(change),
	},
	(types, other) => false,
	new Set([]),
);
