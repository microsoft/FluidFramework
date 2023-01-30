/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Delta, makeAnonChange, tagChange, TaggedChange } from "../../core";
import { brand, JsonCompatibleReadOnly } from "../../util";
import {
	FieldChangeHandler,
	NodeChangeset,
	ToDelta,
	NodeChangeEncoder,
	NodeChangeDecoder,
	NodeChangeComposer,
	NodeChangeInverter,
	NodeChangeRebaser,
	IdAllocator,
} from "./fieldChangeHandler";
import { FieldKind, Multiplicity } from "./fieldKind";

/**
 * A field-kind-agnostic change to a single node within a field.
 */
export interface GenericChange {
	/**
	 * Index within the field of the changed node.
	 */
	index: number;
	/**
	 * Change to the node.
	 */
	nodeChange: NodeChangeset;
}

/**
 * Encoded version of {@link GenericChange}
 */
export interface EncodedGenericChange {
	index: number;
	// TODO: this format needs more documentation (ideally in the form of more specific types).
	nodeChange: JsonCompatibleReadOnly;
}

/**
 * A field-agnostic set of changes to the elements of a field.
 */
export type GenericChangeset = GenericChange[];

/**
 * Encoded version of {@link GenericChangeset}
 */
export type EncodedGenericChangeset = EncodedGenericChange[];

/**
 * {@link FieldChangeHandler} implementation for {@link GenericChangeset}.
 */
export const genericChangeHandler: FieldChangeHandler<GenericChangeset> = {
	rebaser: {
		compose: (
			changes: TaggedChange<GenericChangeset>[],
			composeChildren: NodeChangeComposer,
		): GenericChangeset => {
			if (changes.length === 0) {
				return [];
			}
			const composed: GenericChangeset = [];
			for (const change of changes) {
				let listIndex = 0;
				for (const { index, nodeChange } of change.change) {
					const taggedChange = tagChange(nodeChange, change.revision);
					while (listIndex < composed.length && composed[listIndex].index < index) {
						listIndex += 1;
					}
					const match: GenericChange | undefined = composed[listIndex];
					if (match === undefined) {
						composed.push({ index, nodeChange: composeChildren([taggedChange]) });
					} else if (match.index > index) {
						composed.splice(listIndex, 0, {
							index,
							nodeChange: composeChildren([taggedChange]),
						});
					} else {
						composed.splice(listIndex, 1, {
							index,
							nodeChange: composeChildren([
								// `match.nodeChange` was the result of a call to `composeChildren`,
								// so it does not need a revision tag.
								// See the contract of `FieldChangeHandler.compose`.
								makeAnonChange(match.nodeChange),
								taggedChange,
							]),
						});
					}
				}
			}
			return composed;
		},
		invert: (
			{ change }: TaggedChange<GenericChangeset>,
			invertChild: NodeChangeInverter,
		): GenericChangeset => {
			return change.map(
				({ index, nodeChange }: GenericChange): GenericChange => ({
					index,
					nodeChange: invertChild(nodeChange),
				}),
			);
		},
		rebase: (
			change: GenericChangeset,
			{ change: over }: TaggedChange<GenericChangeset>,
			rebaseChild: NodeChangeRebaser,
		): GenericChangeset => {
			const rebased: GenericChangeset = [];
			let iChange = 0;
			let iOver = 0;
			while (iChange < change.length && iOver < over.length) {
				const a = change[iChange];
				const b = over[iOver];
				if (a.index === b.index) {
					rebased.push({
						index: a.index,
						nodeChange: rebaseChild(a.nodeChange, b.nodeChange),
					});
					iChange += 1;
					iOver += 1;
				} else if (a.index < b.index) {
					rebased.push(a);
					iChange += 1;
				} else {
					iOver += 1;
				}
			}
			rebased.push(...change.slice(iChange));
			return rebased;
		},
	},
	encoder: {
		encodeForJson(
			formatVersion: number,
			change: GenericChangeset,
			encodeChild: NodeChangeEncoder,
		): JsonCompatibleReadOnly {
			const encoded: JsonCompatibleReadOnly[] & EncodedGenericChangeset = change.map(
				({ index, nodeChange }) => ({ index, nodeChange: encodeChild(nodeChange) }),
			);
			return encoded;
		},
		decodeJson: (
			formatVersion: number,
			change: JsonCompatibleReadOnly,
			decodeChild: NodeChangeDecoder,
		): GenericChangeset => {
			const encoded = change as JsonCompatibleReadOnly[] & EncodedGenericChangeset;
			return encoded.map(
				({ index, nodeChange }: EncodedGenericChange): GenericChange => ({
					index,
					nodeChange: decodeChild(nodeChange),
				}),
			);
		},
	},
	editor: {
		buildChildChange(index, change): GenericChangeset {
			return [{ index, nodeChange: change }];
		},
	},
	intoDelta: (change: GenericChangeset, deltaFromChild: ToDelta): Delta.MarkList => {
		let nodeIndex = 0;
		const delta: Delta.Mark[] = [];
		for (const { index, nodeChange } of change) {
			if (nodeIndex < index) {
				const offset = index - nodeIndex;
				delta.push(offset);
				nodeIndex = index;
			}
			delta.push(deltaFromChild(nodeChange, index));
			nodeIndex += 1;
		}
		return delta;
	},
};

/**
 * {@link FieldKind} used to represent changes to elements of a field in a field-kind-agnostic format.
 */
export const genericFieldKind: FieldKind = new FieldKind(
	brand("ModularEditBuilder.Generic"),
	Multiplicity.Sequence,
	genericChangeHandler,
	(types, other) => false,
	new Set(),
);

/**
 * Converts a {@link GenericChangeset} into a field-kind-specific `TChange`.
 * @param changeset - The generic changeset to convert.
 * @param target - The {@link FieldChangeHandler} for the `FieldKind` that the returned change should target.
 * @param composeChild - A delegate to compose {@link NodeChangeset}s.
 * @returns An equivalent changeset as represented by the `target` field-kind.
 */
export function convertGenericChange<TChange>(
	changeset: GenericChangeset,
	target: FieldChangeHandler<TChange>,
	composeChild: NodeChangeComposer,
	genId: IdAllocator,
): TChange {
	const perIndex: TaggedChange<TChange>[] = changeset.map(({ index, nodeChange }) =>
		makeAnonChange(target.editor.buildChildChange(index, nodeChange)),
	);
	return target.rebaser.compose(perIndex, composeChild, genId);
}
