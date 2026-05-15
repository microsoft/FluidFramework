/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { type Static, Type } from "@sinclair/typebox";

import { JsonCompatibleReadOnlySchema } from "../../util/index.js";

export const EncodedSchemaChange = Type.Object({
	new: JsonCompatibleReadOnlySchema,
	old: JsonCompatibleReadOnlySchema,
});

export type EncodedSchemaChange = Static<typeof EncodedSchemaChange>;
