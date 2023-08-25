/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Type } from "@sinclair/typebox";
import { ICodecFamily, makeCodecFamily, makeValueCodec } from "../codec";
import {
	BrandedFieldKind,
	FieldChangeHandler,
	FieldChangeRebaser,
	singleTextCursor,
} from "../feature-libraries";
// This is imported directly to implement an example of a field kind.
import {
	FieldEditor,
	FieldKind,
	Multiplicity,
	ToDelta,
	referenceFreeFieldChangeRebaser,
	// eslint-disable-next-line import/no-internal-modules
} from "../feature-libraries/modular-schema";
import { brand, fail } from "../util";
import { Delta, FieldKindIdentifier, FieldStoredSchema, TaggedChange, TreeTypeSet } from "../core";
import { jsonNumber } from "../domains";

export const counterCodecFamily: ICodecFamily<number> = makeCodecFamily([
	[0, makeValueCodec(Type.Number())],
]);

/**
 * @returns a ChangeRebaser that assumes all the changes commute, meaning that order does not matter.
 */
function commutativeRebaser<TChange>(data: {
	compose: (changes: TChange[]) => TChange;
	invert: (changes: TChange) => TChange;
}): FieldChangeRebaser<TChange> {
	const rebase = (change: TChange, _over: TChange) => change;
	return referenceFreeFieldChangeRebaser({ ...data, rebase });
}

/**
 * ChangeHandler that does not support any changes.
 *
 * TODO: Due to floating point precision compose is not quite associative.
 * This may violate our requirements.
 * This could be fixed by making this integer only
 * and handling values past Number.MAX_SAFE_INTEGER (ex: via an arbitrarily large integer library)
 * or via modular arithmetic.
 */
export const counterHandle: FieldChangeHandler<number> = {
	rebaser: commutativeRebaser({
		compose: (changes: number[]) => changes.reduce((a, b) => a + b, 0),
		invert: (change: number) => -change,
	}),
	codecsFactory: () => counterCodecFamily,
	editor: { buildChildChange: (index, change) => fail("Child changes not supported") },
	intoDelta: ({ change }: TaggedChange<number>, deltaFromChild: ToDelta): Delta.MarkList => [
		{
			type: Delta.MarkType.Modify,
			fields: new Map([
				[
					brand("value"),
					[
						{ type: Delta.MarkType.Delete, count: 1 },
						{
							type: Delta.MarkType.Insert,
							content: [
								singleTextCursor({
									// KLUDGE: Domains should not be depended on by anything.
									// This is to get around the removal of setValue.
									type: jsonNumber.name,
									value: change,
								}),
							],
						},
					],
				],
			]),
		},
	],
	isEmpty: (change: number) => change === 0,
};

/**
 * Field kind for counters.
 * Stores a single value which corresponds to number which can be added to.
 *
 * @remarks
 * This field kind is stored in the test directory as an example of a field kind implementation.
 *
 * This is an example of a few interesting things:
 *
 * - A field kind with some constraints on what can be under it type wise.
 * Other possible examples which would do this include sets, maps (for their keys),
 * or any domain specific specialized kinds.
 *
 * - A field kind with commutative edits.
 *
 * TODO:
 * What should the subtrees under this look like?
 * How does it prevent / interact with direct edits to the subtree (ex: set value)?
 * How should it use its type set?
 * How should it handle lack of associative addition due to precision and overflow?
 */
export const counter: BrandedFieldKind<
	"Counter",
	Multiplicity.Value,
	FieldEditor<number>
> = brandedFieldKind(
	"Counter",
	Multiplicity.Value,
	counterHandle,
	(types, other) => other.kind.identifier === counter.identifier,
	new Set(),
);

function brandedFieldKind<
	TName extends string,
	TMultiplicity extends Multiplicity,
	TEditor extends FieldEditor<any>,
>(
	identifier: TName,
	multiplicity: TMultiplicity,
	changeHandler: FieldChangeHandler<any, TEditor>,
	allowsTreeSupersetOf: (originalTypes: TreeTypeSet, superset: FieldStoredSchema) => boolean,
	handlesEditsFrom: ReadonlySet<FieldKindIdentifier>,
): BrandedFieldKind<TName, TMultiplicity, TEditor> {
	return new FieldKind<TEditor, TMultiplicity>(
		brand(identifier),
		multiplicity,
		changeHandler,
		allowsTreeSupersetOf,
		handlesEditsFrom,
	) as BrandedFieldKind<TName, TMultiplicity, TEditor>;
}
