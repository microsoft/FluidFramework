/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { brand, namedTreeSchema, ValueSchema } from "@fluid-internal/tree";

export const numberSchema = namedTreeSchema({
	name: brand("number"),
	value: ValueSchema.Number,
});
