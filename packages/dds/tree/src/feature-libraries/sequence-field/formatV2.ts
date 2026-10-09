/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as Type from "typebox/type";
import { typeboxInterface, typeboxOptional } from "../../util/index.js";

import type { TObjectOptions, Static, TSchema } from "typebox";

import { unionOptions } from "../../codec/index.js";
import { RevisionTagSchema } from "../../core/index.js";
import { ChangesetLocalIdSchema, EncodedChangeAtomId } from "../modular-schema/index.js";

const noAdditionalProps: TObjectOptions = { additionalProperties: false };

const CellCount = Type.Number({ multipleOf: 1, minimum: 1 });

const MoveId = ChangesetLocalIdSchema;
const HasMoveId = Type.Object({ id: MoveId });

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const IdRange = Type.Tuple([ChangesetLocalIdSchema, CellCount]);

export const CellId = EncodedChangeAtomId;

const HasRevisionTag = Type.Object({ revision: typeboxOptional(RevisionTagSchema) });

const Insert = typeboxInterface([HasMoveId, HasRevisionTag], {}, noAdditionalProps);

const HasMoveFields = typeboxInterface(
	[
		HasMoveId,
		HasRevisionTag,
		Type.Object({ finalEndpoint: typeboxOptional(EncodedChangeAtomId) }),
	],
	{},
);

const MoveIn = typeboxInterface([HasMoveFields], {}, noAdditionalProps);

const DetachFields = Type.Object({
	idOverride: typeboxOptional(CellId),
});

const Remove = typeboxInterface(
	[
		Type.Object({
			id: ChangesetLocalIdSchema,
		}),
		HasRevisionTag,
		DetachFields,
	],
	{},
	noAdditionalProps,
);

const MoveOut = typeboxInterface([HasMoveFields, DetachFields], {}, noAdditionalProps);

const Attach = Type.Object(
	{
		insert: typeboxOptional(Insert),
		moveIn: typeboxOptional(MoveIn),
	},
	unionOptions,
);

const Detach = Type.Object(
	{
		remove: typeboxOptional(Remove),
		moveOut: typeboxOptional(MoveOut),
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
		insert: typeboxOptional(Insert),
		moveIn: typeboxOptional(MoveIn),
		remove: typeboxOptional(Remove),
		moveOut: typeboxOptional(MoveOut),
		attachAndDetach: typeboxOptional(AttachAndDetach),
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
			effect: typeboxOptional(tMark),
			cellId: typeboxOptional(CellId),
			changes: typeboxOptional(tNodeChange),
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
 * @privateRemarks Many of these names are currently used in the sequence-field types. Putting them in a namespace makes codec code more readable.
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
