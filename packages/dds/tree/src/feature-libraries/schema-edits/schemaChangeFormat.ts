/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { type Static, Type } from "@sinclair/typebox";

import { FormatV1 as Format } from "../schema-index/index.js";

export const EncodedSchemaChange = Type.Object({
	new: Format,
	old: Format,
});

export type EncodedSchemaChange = Static<typeof EncodedSchemaChange>;
