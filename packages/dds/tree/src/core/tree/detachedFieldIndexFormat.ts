/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { type Static, Type } from "@sinclair/typebox";

import { brandedNumberType } from "../../util/index.js";
import { RevisionTagSchema } from "../rebase/index.js";

import type { ForestRootId } from "./detachedFieldIndexTypes.js";

export const version = 1.0;

/**
 * The ID of a detached node. Is not globally unique on.
 * A `RevisionTag` + `DetachId` pair is globally unique and eventually consistent across clients.
 */
export const DetachId = Type.Number({ multipleOf: 1 });

/**
 * The ID of a root node in the forest associated with the owning checkout. Is unique for that forest.
 * Is not consistent across clients.
 */
const ForestRootIdSchema = brandedNumberType<ForestRootId>({ minimum: -1, multipleOf: 1 });

/**
 * A mapping from a range of the detached node IDs the corresponding range root IDs.
 * The detached node IDs need to be qualified with a revision (stored in the containing `EncodedRootsForRevision`).
 * Note: the length of the range (currently always 1) can be looked up in the forest.
 */
export const RootRange = Type.Tuple([
	// ID for the first detached node
	DetachId,
	// ID for the first root node
	ForestRootIdSchema,
]);
export type RootRange = Static<typeof RootRange>;

export const RootRanges = Type.Array(RootRange);
export type RootRanges = Static<typeof RootRanges>;

/**
 * For all the roots detached in a revision, represents a mapping from the detached node ID to corresponding root ID.
 */
export const EncodedRootsForRevision = Type.Union([
	// Used to represent a revision in which more than one node were detached
	Type.Tuple([RevisionTagSchema, RootRanges]),
	// Used to represent a revision in which a single node was detached
	Type.Tuple([RevisionTagSchema, DetachId, ForestRootIdSchema]),
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
