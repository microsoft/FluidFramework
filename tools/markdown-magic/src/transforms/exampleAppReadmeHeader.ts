/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { Transform } from "../types.js";
import { generateGettingStarted } from "./exampleGettingStarted.js";
import { transform } from "./options.js";
import { readPackage } from "./packageMetadata.js";
import { headingLevelSchema, packageSchema } from "./schemas.js";

/**
 * Generates the standard sections that precede an example application README body.
 */
export const exampleAppReadmeHeaderTransform: Transform = transform(
	"example-app-readme-header",
	{
		...packageSchema,
		...headingLevelSchema,
		gettingStarted: { type: "boolean", default: true },
		usesTinylicious: { type: "boolean", default: true },
	},
	async (options, context) =>
		options.gettingStarted
			? generateGettingStarted(
					await readPackage(context, options),
					options.usesTinylicious,
					{ includeHeading: true },
					context,
				)
			: [],
);
