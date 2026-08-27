/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { RootContent } from "mdast";

import type { Transform, TransformContext } from "../types.js";
import { parseFragment } from "./markdown.js";
import { transform } from "./options.js";
import { readPackage } from "./packageMetadata.js";
import { headingSchema, type HeadingOptions, packageSchema } from "./schemas.js";

/** Generates a link to the package API documentation. */
export function generateApiDocs(
	packageName: string,
	options: HeadingOptions,
	context: TransformContext,
): RootContent[] {
	const shortName = packageName.includes("/")
		? packageName.slice(packageName.indexOf("/") + 1)
		: packageName;
	const heading = options.includeHeading
		? `${"#".repeat(context.sectionHeadingDepth)} API Documentation\n\n`
		: "";
	return parseFragment(
		`${heading}API documentation for **${packageName}** is available at <https://fluidframework.com/docs/apis/${shortName}>.`,
		context,
		"api-docs",
	);
}

export const apiDocsTransform: Transform = transform(
	"api-docs",
	{ ...packageSchema, ...headingSchema },
	async (options, context) => {
		const packageMetadata = await readPackage(context, options);
		return generateApiDocs(packageMetadata.name, options, context);
	},
);
