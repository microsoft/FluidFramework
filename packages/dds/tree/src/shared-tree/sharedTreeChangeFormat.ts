/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Static, Type } from "@sinclair/typebox";
import { EncodedModularChangeset, EncodedSchemaChange } from "../feature-libraries/index.js";

export const EncodedSharedTreeInnerChange = Type.Object({
	schema: Type.Optional(EncodedSchemaChange),
	data: Type.Optional(EncodedModularChangeset),
});

export type EncodedSharedTreeInnerChange = Static<typeof EncodedSharedTreeInnerChange>;

export const EncodedSharedTreeChange = Type.Array(EncodedSharedTreeInnerChange);

export type EncodedSharedTreeChange = Static<typeof EncodedSharedTreeChange>;
