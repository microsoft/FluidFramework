/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Context, type TreeNodeSchema, UnhydratedContext } from "./core/index.js";
import { toFlexSchema } from "./toFlexSchema.js";

/**
 * Utility for creating {@link Context}s for unhydrated nodes.
 */
export function createUnhydratedContext(schema: TreeNodeSchema): Context {
	const flexContext = new UnhydratedContext(toFlexSchema(schema));
	return new Context([schema], flexContext);
}
