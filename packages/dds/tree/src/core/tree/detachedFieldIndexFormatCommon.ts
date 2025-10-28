/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { type Static, type TSchema, Type } from "@sinclair/typebox";

import { brandedNumberType } from "../../util/index.js";

import type { ForestRootId } from "./detachedFieldIndexTypes.js";

/**
 * The format version for the detached field index.
 */
export const DetachedFieldIndexFormatVersion = {
	v1: 1,
	v2: 2,
};
export type DetachedFieldIndexFormatVersion =
	(typeof DetachedFieldIndexFormatVersion)[keyof typeof DetachedFieldIndexFormatVersion];

/**
 * The ID of a detached node. Is not globally unique on.
 * A `RevisionTag` + `DetachId` pair is globally unique and eventually consistent across clients.
 */
export const DetachId = Type.Number({ multipleOf: 1 });

/**
 * The ID of a root node in the forest associated with the owning checkout. Is unique for that forest.
 * Is not consistent across clients.
 */
export const ForestRootIdSchema = brandedNumberType<ForestRootId>({
	minimum: -1,
	multipleOf: 1,
});

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
// Return type is intentionally derived.
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export const EncodedRootsForRevision = <Schema extends TSchema>(tRevisionTag: Schema) =>
	Type.Union([
		// Used to represent a revision in which more than one node were detached
		Type.Tuple([tRevisionTag, RootRanges]),
		// Used to represent a revision in which a single node was detached
		Type.Tuple([tRevisionTag, DetachId, ForestRootIdSchema]),
	]);
export type EncodedRootsForRevision = Static<ReturnType<typeof EncodedRootsForRevision>>;

export const Format = <TVersion extends number, TRevisionTagSchema extends TSchema>(
	tVersion: TVersion,
	tRevisionTag: TRevisionTagSchema,
	// Return type is intentionally derived.
	// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
) =>
	Type.Object(
		{
			version: Type.Literal(tVersion),
			data: Type.Array(EncodedRootsForRevision(tRevisionTag)),
			maxId: ForestRootIdSchema,
		},
		{ additionalProperties: false },
	);

export type Format = Static<ReturnType<typeof Format>>;
