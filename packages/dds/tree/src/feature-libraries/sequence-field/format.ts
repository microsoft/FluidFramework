/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ObjectOptions, Static, TSchema, Type } from "@sinclair/typebox";
import { RevisionTagSchema } from "../../core";
import { ChangesetLocalIdSchema, EncodedChangeAtomId } from "../modular-schema";
import { unionOptions } from "../../codec";

const noAdditionalProps: ObjectOptions = { additionalProperties: false };

const CellCount = Type.Number();

const MoveId = ChangesetLocalIdSchema;
const HasMoveId = Type.Object({ id: MoveId });

const LineageEvent = Type.Tuple([
	RevisionTagSchema,
	ChangesetLocalIdSchema,
	/* count */ Type.Number(),
	/* offset */ Type.Number(),
]);

const HasLineage = Type.Object({ lineage: Type.Optional(Type.Array(LineageEvent)) });

const IdRange = Type.Tuple([ChangesetLocalIdSchema, CellCount]);

const CellId = Type.Composite(
	[
		EncodedChangeAtomId,
		HasLineage,
		Type.Object({ adjacentCells: Type.Optional(Type.Array(IdRange)) }),
	],
	noAdditionalProps,
);

const HasRevisionTag = Type.Object({ revision: Type.Optional(RevisionTagSchema) });

const Insert = Type.Composite([HasMoveId, HasRevisionTag], noAdditionalProps);

const HasMoveFields = Type.Composite([
	HasMoveId,
	HasRevisionTag,
	Type.Object({ finalEndpoint: Type.Optional(EncodedChangeAtomId) }),
]);

const MoveIn = Type.Composite([HasMoveFields], noAdditionalProps);

const RedetachFields = Type.Object({
	redetachId: Type.Optional(CellId),
});

const Delete = Type.Composite(
	[
		Type.Object({
			id: ChangesetLocalIdSchema,
		}),
		HasRevisionTag,
		RedetachFields,
	],
	noAdditionalProps,
);

const MoveOut = Type.Composite([HasMoveFields, RedetachFields], noAdditionalProps);

const Attach = Type.Object(
	{
		insert: Type.Optional(Insert),
		moveIn: Type.Optional(MoveIn),
	},
	unionOptions,
);

const Detach = Type.Object(
	{
		delete: Type.Optional(Delete),
		moveOut: Type.Optional(MoveOut),
	},
	unionOptions,
);

const AttachAndDetach = Type.Object({
	attach: Attach,
	detach: Detach,
});

const MarkEffect = Type.Object(
	{
		// Note: `noop` is encoded by omitting `effect` from the encoded cell mark, so is not included here.
		insert: Type.Optional(Insert),
		moveIn: Type.Optional(MoveIn),
		delete: Type.Optional(Delete),
		moveOut: Type.Optional(MoveOut),
		attachAndDetach: Type.Optional(AttachAndDetach),
	},
	unionOptions,
);

const CellMark = <TMark extends TSchema, TNodeChange extends TSchema>(
	tMark: TMark,
	tNodeChange: TNodeChange,
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

const Mark = <Schema extends TSchema>(tNodeChange: Schema) => CellMark(MarkEffect, tNodeChange);

export const Changeset = <Schema extends TSchema>(tNodeChange: Schema) =>
	Type.Array(Mark(tNodeChange));

/**
 * @privateRemarks - Many of these names are currently used in the sequence-field types. Putting them in a namespace makes codec code more readable.
 */
export namespace Encoded {
	export type CellCount = Static<typeof CellCount>;

	export type MoveId = Static<typeof MoveId>;
	export type LineageEvent = Static<typeof LineageEvent>;
	export type IdRange = Static<typeof IdRange>;

	export type CellId = Static<typeof CellId>;

	export type Insert = Static<typeof Insert>;
	export type MoveIn = Static<typeof MoveIn>;
	export type Delete = Static<typeof Delete>;
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
