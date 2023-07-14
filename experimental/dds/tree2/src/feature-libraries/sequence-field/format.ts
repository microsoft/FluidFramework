/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { TSchema, Type } from "@sinclair/typebox";
import { RevisionTagSchema } from "../../core";
import { ChangesetLocalIdSchema, EncodedChangeAtomId } from "../modular-schema";
import { Tiebreak } from "./types";

export const ProtoNode = Type.Any();
export const NodeCount = Type.Number();

export const LineageEvent = Type.Object(
	{
		revision: Type.Readonly(RevisionTagSchema),
		offset: Type.Readonly(Type.Number()),
	},
	{ additionalProperties: false },
);

export const DetachEvent = Type.Object(
	{
		revision: RevisionTagSchema,
		index: Type.Number(),
	},
	{ additionalProperties: false },
);

export const PlaceAnchor = <Schema extends TSchema>(t: Schema) =>
	Type.Object(
		{
			tiebreak: Type.Optional(Type.Enum(Tiebreak)),
			lineage: Type.Optional(Type.Array(LineageEvent)),
			payload: t,
		},
		{ additionalProperties: false },
	);

export const NodesAnchor = <Schema extends TSchema>(t: Schema) =>
	Type.Object(
		{
			count: NodeCount,
			detachEvent: Type.Optional(DetachEvent),
			lineage: Type.Optional(Type.Array(LineageEvent)),
			payload: t,
		},
		{ additionalProperties: false },
	);

export const ShallowCellChange = Type.Object({
	id: ChangesetLocalIdSchema,
	revision: Type.Optional(RevisionTagSchema),
});

export const Alloc = <Schema extends TSchema>(tNodeChange: Schema, tTree: Schema) =>
	Type.Intersect([
		ShallowCellChange,
		Type.Object(
			{
				count: NodeCount,
				changes: CellChanges(tNodeChange, tTree),
			},
			{ additionalProperties: false },
		),
	]);

export const Fill = <Schema extends TSchema>(tTree: Schema) =>
	Type.Intersect([
		ShallowCellChange,
		Type.Object(
			{
				type: Type.Literal("Fill"),
				content: Type.Union([EncodedChangeAtomId, Type.Readonly(Type.Array(tTree))]),
			},
			{ additionalProperties: false },
		),
	]);

export const Clear = Type.Intersect([
	ShallowCellChange,
	Type.Object(
		{
			type: Type.Literal("Clear"),
			isMove: Type.Optional(Type.Literal(true)),
			followNodes: Type.Optional(Type.Literal(true)),
		},
		{ additionalProperties: false },
	),
]);

export const Modify = <Schema extends TSchema>(tNodeChange: Schema) =>
	Type.Object(
		{
			type: Type.Literal("Modify"),
			changes: tNodeChange,
		},
		{ additionalProperties: false },
	);

export const CellChange = <Schema extends TSchema>(tNodeChange: Schema, tTree: Schema) =>
	Type.Union([Fill(tTree), Modify(tNodeChange), Clear]);

export const CellChanges = <Schema extends TSchema>(tNodeChange: Schema, tTree: Schema) =>
	Type.Readonly(Type.Array(CellChange(tNodeChange, tTree)));

export const PlaceMark = <Schema extends TSchema>(tNodeChange: Schema, tTree: Schema) =>
	Type.Intersect([
		PlaceAnchor(Alloc(tNodeChange, tTree)),
		Type.Object(
			{
				type: Type.Literal("Place"),
			},
			{ additionalProperties: false },
		),
	]);

export const NodesMark = <Schema extends TSchema>(tNodeChange: Schema, tTree: Schema) =>
	Type.Intersect([
		NodesAnchor(Type.Union([CellChanges(tNodeChange, tTree), Type.Undefined()])),
		Type.Object(
			{
				type: Type.Literal("Cells"),
			},
			{ additionalProperties: false },
		),
	]);

export const Mark = <Schema extends TSchema>(tNodeChange: Schema, tTree: Schema) =>
	Type.Union([PlaceMark(tNodeChange, tTree), NodesMark(tNodeChange, tTree)]);

export const MarkList = <Schema extends TSchema>(tNodeChange: Schema, tTree: Schema) =>
	Type.Readonly(Type.Array(Mark(tNodeChange, tTree)));

export const Changeset = <Schema extends TSchema>(tNodeChange: Schema, tTree: Schema) =>
	MarkList(tNodeChange, tTree);
