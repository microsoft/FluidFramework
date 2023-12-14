/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Type } from "@sinclair/typebox";
import { Format } from "../schemaIndexFormat";

// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
export type EncodedSchemaChange = {
	readonly new: Format;
	readonly old: Format;
};

export const EncodedSchemaChange = Type.Object({
	new: Format,
	old: Format,
});
