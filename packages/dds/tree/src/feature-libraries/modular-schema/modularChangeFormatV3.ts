/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { type ObjectOptions, type Static, Type } from "@sinclair/typebox";

import {
	ChangesetLocalIdSchema,
	EncodedBuilds,
	EncodedChangeAtomId,
	EncodedFieldChangeMap,
	EncodedNodeChangeset,
	EncodedRevisionInfo,
} from "./modularChangeFormatV1.js";
import { EncodedNoChangeConstraint } from "./modularChangeFormatV2.js";

const noAdditionalProps: ObjectOptions = { additionalProperties: false };

const EncodedRenames = Type.Optional(
	Type.Array(
		Type.Object({
			oldId: EncodedChangeAtomId,
			newId: EncodedChangeAtomId,
			count: Type.Number(),
		}),
		noAdditionalProps,
	),
);

export type EncodedRenames = Static<typeof EncodedRenames>;

const EncodedRootNodes = Type.Optional(
	Type.Array(
		Type.Object(
			{ detachId: EncodedChangeAtomId, nodeChangeset: EncodedNodeChangeset },
			noAdditionalProps,
		),
	),
);

export type EncodedRootNodes = Static<typeof EncodedRootNodes>;

export const EncodedModularChangesetV3 = Type.Object(
	{
		maxId: Type.Optional(ChangesetLocalIdSchema),
		fieldChanges: EncodedFieldChangeMap,
		rootNodes: EncodedRootNodes,
		nodeRenames: EncodedRenames,
		revisions: Type.ReadonlyOptional(Type.Array(EncodedRevisionInfo)),
		// TODO#8574: separating `builds` and `refreshers` here means that we encode their `EncodedBuilds.trees` separately.
		// This can lead to a less efficient wire representation because of duplicated schema/shape information.
		builds: Type.Optional(EncodedBuilds),
		refreshers: Type.Optional(EncodedBuilds),

		/**
		 * The number of constraints within this changeset that are violated.
		 */
		violations: Type.Optional(Type.Number({ minimum: 0, multipleOf: 1 })),

		/** Global no change constraint that gets violated whenever the changeset is rebased */
		noChangeConstraint: Type.Optional(EncodedNoChangeConstraint),
	},
	noAdditionalProps,
);

export type EncodedModularChangesetV3 = Static<typeof EncodedModularChangesetV3>;
