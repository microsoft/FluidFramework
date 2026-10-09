/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// Many of the return types in this module are intentionally derived, rather than explicitly specified.
/* eslint-disable @typescript-eslint/explicit-function-return-type */

import * as Type from "typebox/type";
import type { Static, TSchema } from "typebox";

export const EncodedGenericChange = <NodeChangesetSchema extends TSchema>(
	tNodeChangeset: NodeChangesetSchema,
) => Type.Tuple([Type.Integer({ minimum: 0 }), tNodeChangeset]);

export type EncodedGenericChange<Schema extends TSchema> = Static<
	ReturnType<typeof EncodedGenericChange<Schema>>
>;

export const EncodedGenericChangeset = <NodeChangesetSchema extends TSchema>(
	tNodeChangeset: NodeChangesetSchema,
) => Type.Array(EncodedGenericChange(tNodeChangeset));

export type EncodedGenericChangeset<Schema extends TSchema> = Static<
	ReturnType<typeof EncodedGenericChangeset<Schema>>
>;
