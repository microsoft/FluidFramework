/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { type ObjectOptions, type Static, type TSchema, Type } from "@sinclair/typebox";

import { unionOptions } from "../../codec/index.js";
import { RevisionTagSchema } from "../../core/index.js";
import { ChangesetLocalIdSchema, EncodedChangeAtomId } from "../modular-schema/index.js";

const noAdditionalProps: ObjectOptions = { additionalProperties: false };

const CellCount = Type.Number({ multipleOf: 1, minimum: 1 });

const MoveId = ChangesetLocalIdSchema;
const HasMoveId = Type.Object({ id: MoveId });

const IdRange = Type.Tuple([ChangesetLocalIdSchema, CellCount]);

export const CellId = EncodedChangeAtomId;

const HasRevisionTag = Type.Object({ revision: Type.Optional(RevisionTagSchema) });

const Insert = Type.Composite([HasMoveId, HasRevisionTag], noAdditionalProps);

const HasMoveFields = Type.Composite([
	HasMoveId,
	HasRevisionTag,
	Type.Object({ finalEndpoint: Type.Optional(EncodedChangeAtomId) }),
]);

const MoveIn = Type.Composite([HasMoveFields], noAdditionalProps);

const DetachFields = Type.Object({
	idOverride: Type.Optional(CellId),
});

const Remove = Type.Composite(
	[
		Type.Object({
			id: ChangesetLocalIdSchema,
		}),
		HasRevisionTag,
		DetachFields,
	],
	noAdditionalProps,
);

const MoveOut = Type.Composite([HasMoveFields, DetachFields], noAdditionalProps);

const Attach = Type.Object(
	{
		insert: Type.Optional(Insert),
		moveIn: Type.Optional(MoveIn),
	},
	unionOptions,
);

const Detach = Type.Object(
	{
		remove: Type.Optional(Remove),
		moveOut: Type.Optional(MoveOut),
	},
	unionOptions,
);

const AttachAndDetach = Type.Object({
	attach: Attach,
	detach: Detach,
});

export const MarkEffect = Type.Object(
	{
		// Note: `noop` is encoded by omitting `effect` from the encoded cell mark, so is not included here.
		insert: Type.Optional(Insert),
		moveIn: Type.Optional(MoveIn),
		remove: Type.Optional(Remove),
		moveOut: Type.Optional(MoveOut),
		attachAndDetach: Type.Optional(AttachAndDetach),
	},
	unionOptions,
);

export const CellMark = <TMark extends TSchema, TNodeChange extends TSchema>(
	tMark: TMark,
	tNodeChange: TNodeChange,
	// Return type is intentionally derived.
	// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
) =>
	Type.Object(
		{
			// If undefined, indicates a Noop mark.
			effect: Type.Optional(tMark),
			cellId: Type.Optional(CellId),
			changes: Type.Optional(tNodeChange),
			count: CellCount,
		},
		noAdditionalProps,
	);

// Return type is intentionally derived.
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
const Mark = <Schema extends TSchema>(tNodeChange: Schema) =>
	CellMark(MarkEffect, tNodeChange);

// Return type is intentionally derived.
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export const Changeset = <Schema extends TSchema>(tNodeChange: Schema) =>
	Type.Array(Mark(tNodeChange));

/**
 * @privateRemarks - Many of these names are currently used in the sequence-field types. Putting them in a namespace makes codec code more readable.
 */
export namespace Encoded {
	export type CellCount = Static<typeof CellCount>;

	export type MoveId = Static<typeof MoveId>;
	export type IdRange = Static<typeof IdRange>;

	export type CellId = Static<typeof CellId>;

	export type Insert = Static<typeof Insert>;
	export type MoveIn = Static<typeof MoveIn>;
	export type Remove = Static<typeof Remove>;
	export type MoveOut = Static<typeof MoveOut>;
	export type Attach = Static<typeof Attach>;
	export type Detach = Static<typeof Detach>;
	export type AttachAndDetach = Static<typeof AttachAndDetach>;
	export type MarkEffect = Static<typeof MarkEffect>;

	export type CellMark<Schema extends TSchema, TNodeChange extends TSchema> = Static<
		ReturnType<typeof CellMark<Schema, TNodeChange>>
	>;
	export type Mark<Schema extends TSchema> = Static<ReturnType<typeof Mark<Schema>>>;
	export type Changeset<Schema extends TSchema> = Static<ReturnType<typeof Changeset<Schema>>>;
}
