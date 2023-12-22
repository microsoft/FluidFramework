/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Static, Type } from "@sinclair/typebox";
import { brandedNumberType } from "../../util";
import { RevisionTagSchema } from "../rebase";
import { ForestRootId } from "./detachedFieldIndex";

export const version = 1.0;

export type EncodedRoots = Static<typeof EncodedRootsForRevision>;

export const DetachId = Type.Number({ multipleOf: 1 });
const ForestRootIdSchema = brandedNumberType<ForestRootId>({ minimum: -1, multipleOf: 1 });

export const RootRange = Type.Union([
	Type.Tuple([
		// ID for the first detached node
		DetachId,
		// ID for the first root node
		ForestRootIdSchema,
		// Number of nodes
		Type.Number({ minimum: 2, multipleOf: 1 }),
	]),
	// Omit the number of nodes when it is 1
	Type.Tuple([DetachId, ForestRootIdSchema]),
]);
export type RootRange = Static<typeof RootRange>;

export const RootRanges = Type.Array(RootRange);
export type RootRanges = Static<typeof RootRanges>;

export const EncodedRootsForRevision = Type.Union([
	Type.Tuple([RootRanges, RevisionTagSchema]),
	// Revision is omitted when undefined
	Type.Tuple([RootRanges]),
]);
export type EncodedRootsForRevision = Static<typeof EncodedRootsForRevision>;

export const Format = Type.Object(
	{
		version: Type.Literal(version),
		data: Type.Array(EncodedRootsForRevision),
		maxId: ForestRootIdSchema,
	},
	{ additionalProperties: false },
);

export type Format = Static<typeof Format>;
