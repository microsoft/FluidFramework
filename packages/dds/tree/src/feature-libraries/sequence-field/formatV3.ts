/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { type ObjectOptions, type Static, type TSchema, Type } from "@sinclair/typebox";

import { unionOptions } from "../../codec/index.js";
import {
	CellId,
	CellMark,
	type Encoded as EncodedV2,
	MarkEffect as MarkEffectV2,
} from "./formatV2.js";

const noAdditionalProps: ObjectOptions = { additionalProperties: false };

const Rename = Type.Object(
	{
		idOverride: CellId,
	},
	noAdditionalProps,
);

const MarkEffect = Type.Composite(
	[MarkEffectV2, Type.Object({ rename: Type.Optional(Rename) })],
	unionOptions,
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
	export type CellCount = EncodedV2.CellCount;

	export type MoveId = EncodedV2.MoveId;
	export type IdRange = EncodedV2.IdRange;
	export type CellId = EncodedV2.CellId;
	export type Insert = EncodedV2.Insert;
	export type MoveIn = EncodedV2.MoveIn;
	export type Remove = EncodedV2.Remove;
	export type MoveOut = EncodedV2.MoveOut;
	export type Attach = EncodedV2.Attach;
	export type Detach = EncodedV2.Detach;
	export type AttachAndDetach = EncodedV2.AttachAndDetach;
	export type CellMark<
		Schema extends TSchema,
		TNodeChange extends TSchema,
	> = EncodedV2.CellMark<Schema, TNodeChange>;

	export type Rename = Static<typeof Rename>;
	export type MarkEffect = Static<typeof MarkEffect>;
	export type Mark<Schema extends TSchema> = Static<ReturnType<typeof Mark<Schema>>>;
	export type Changeset<Schema extends TSchema> = Static<ReturnType<typeof Changeset<Schema>>>;
}
