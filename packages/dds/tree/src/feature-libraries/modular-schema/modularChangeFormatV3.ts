/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { type ObjectOptions, type Static, Type } from "@sinclair/typebox";

import { EncodedChangeAtomId } from "../../core/index.js";

import { EncodedNodeChangeset } from "./modularChangeFormatV1.js";
import { EncodedModularChangesetV2 } from "./modularChangeFormatV2.js";

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

export const EncodedModularChangesetV3 = Type.Composite(
	[
		EncodedModularChangesetV2,
		Type.Object(
			{
				rootNodes: EncodedRootNodes,
				nodeRenames: EncodedRenames,
			},
			noAdditionalProps,
		),
	],
	noAdditionalProps,
);

export type EncodedModularChangesetV3 = Static<typeof EncodedModularChangesetV3>;
