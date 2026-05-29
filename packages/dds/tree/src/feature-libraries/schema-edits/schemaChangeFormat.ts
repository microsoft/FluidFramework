/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { type Static, Object as _typebox_Object } from "@sinclair/typebox";
const Type = { Object: _typebox_Object };

import { JsonCompatibleReadOnlySchema } from "../../util/index.js";

export const EncodedSchemaChange = Type.Object({
	new: JsonCompatibleReadOnlySchema,
	old: JsonCompatibleReadOnlySchema,
});

export type EncodedSchemaChange = Static<typeof EncodedSchemaChange>;
