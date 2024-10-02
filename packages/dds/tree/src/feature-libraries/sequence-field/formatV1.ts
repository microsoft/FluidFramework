/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { type ObjectOptions, type Static, type TSchema, Type } from "@sinclair/typebox";

import { unionOptions } from "../../codec/index.js";
import { RevisionTagSchema } from "../../core/index.js";
import { ChangesetLocalIdSchema, EncodedChangeAtomId } from "../modular-schema/index.js";

export enum DetachIdOverrideType {
	/**
	 * The detach effect is the inverse of the prior attach characterized by the accompanying `CellId`'s revision and
	 * local ID.
	 *
	 * An override is needed in such a case to ensure that rollbacks and undos return tree content to the appropriate
	 * detached root. It is also needed to ensure that cell comparisons work properly for undos.
	 */
	Unattach = 0,
	/**
	 * The detach effect is reapplying a prior detach.
	 *
	 * The accompanying cell ID is used in two ways:
	 * - It indicates the location of the cell (including adjacent cell information) so that rebasing over this detach
	 * can contribute the correct lineage information to the rebased mark.
	 * - It specifies the revision and local ID that should be used to characterize the cell in the output context of
	 * detach.
	 */
	Redetach = 1,
}

const noAdditionalProps: ObjectOptions = { additionalProperties: false };

const CellCount = Type.Number({ multipleOf: 1, minimum: 1 });

const MoveId = ChangesetLocalIdSchema;
const HasMoveId = Type.Object({ id: MoveId });

const LineageEvent = Type.Tuple([
	RevisionTagSchema,
	ChangesetLocalIdSchema,
	/** count */
	CellCount,
	/** offset */
	Type.Number({ multipleOf: 1, minimum: 0 }),
]);

const HasLineage = Type.Object({ lineage: Type.Optional(Type.Array(LineageEvent)) });

const IdRange = Type.Tuple([ChangesetLocalIdSchema, CellCount]);

const CellId = Type.Composite(
	[
		HasLineage,
		Type.Object({
			atom: EncodedChangeAtomId,
			adjacentCells: Type.Optional(Type.Array(IdRange)),
		}),
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

const DetachIdOverride = Type.Object(
	{
		type: Type.Enum(DetachIdOverrideType),
		id: CellId,
	},
	noAdditionalProps,
);

const DetachFields = Type.Object({
	idOverride: Type.Optional(DetachIdOverride),
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
		// TODO:AB6715 rename to `remove`
		delete: Type.Optional(Remove),
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
		// TODO:AB6715 rename to `remove`
		delete: Type.Optional(Remove),
		moveOut: Type.Optional(MoveOut),
		attachAndDetach: Type.Optional(AttachAndDetach),
	},
	unionOptions,
);

const CellMark = <TMark extends TSchema, TNodeChange extends TSchema>(
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
	export type LineageEvent = Static<typeof LineageEvent>;
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
