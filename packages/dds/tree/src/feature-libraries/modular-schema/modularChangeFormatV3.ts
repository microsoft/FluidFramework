/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as Type from "typebox/type";
import type { TObjectOptions } from "typebox";

import { EncodedChangeAtomId } from "../../core/index.js";
import { typeboxInterface } from "../../util/index.js";

import { EncodedNodeChangeset } from "./modularChangeFormatV1.js";
import { EncodedModularChangesetV2 } from "./modularChangeFormatV2.js";

const noAdditionalProps: TObjectOptions = { additionalProperties: false };

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

export type EncodedRenames = Type.Static<typeof EncodedRenames>;

const EncodedRootNodes = Type.Optional(
	Type.Array(
		Type.Object(
			{ detachId: EncodedChangeAtomId, nodeChangeset: EncodedNodeChangeset },
			noAdditionalProps,
		),
	),
);

export type EncodedRootNodes = Type.Static<typeof EncodedRootNodes>;

export const EncodedModularChangesetV3 = typeboxInterface(
	[
		EncodedModularChangesetV2,
		Type.Object(
			{
				rootNodes: EncodedRootNodes,
				nodeRenames: EncodedRenames,
				intermediateRenames: EncodedRenames,
			},
			noAdditionalProps,
		),
	],
	{},
	noAdditionalProps,
);

export type EncodedModularChangesetV3 = Type.Static<typeof EncodedModularChangesetV3>;
