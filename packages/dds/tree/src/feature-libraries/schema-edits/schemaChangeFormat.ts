/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Type, type Static } from "../../util/index.js";
import { JsonCompatibleReadOnlySchema } from "../../util/index.js";

export const EncodedSchemaChange = Type.Object({
	new: JsonCompatibleReadOnlySchema,
	old: JsonCompatibleReadOnlySchema,
});

export type EncodedSchemaChange = Static<typeof EncodedSchemaChange>;
