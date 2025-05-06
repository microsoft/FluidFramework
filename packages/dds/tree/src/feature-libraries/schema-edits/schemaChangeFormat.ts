/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { type Static, Type } from "@sinclair/typebox";
import { Format as FormatV1 } from "../schema-index/index.js";

export const EncodedSchemaChange = Type.Object({
	new: FormatV1,
	old: FormatV1,
});

export type EncodedSchemaChange = Static<typeof EncodedSchemaChange>;
