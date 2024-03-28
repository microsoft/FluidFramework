/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Static, Type } from "@sinclair/typebox";
import { JsonCompatibleReadOnlySchema } from "../util/utils.js";

export const EncodedSharedTreeInnerChange = Type.Object({
	schema: Type.Optional(JsonCompatibleReadOnlySchema),
	data: Type.Optional(JsonCompatibleReadOnlySchema),
});

export type EncodedSharedTreeInnerChange = Static<typeof EncodedSharedTreeInnerChange>;

export const EncodedSharedTreeChange = Type.Array(EncodedSharedTreeInnerChange);

export type EncodedSharedTreeChange = Static<typeof EncodedSharedTreeChange>;
