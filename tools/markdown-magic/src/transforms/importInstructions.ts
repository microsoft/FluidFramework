/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { RootContent } from "mdast";

import type { Transform, TransformContext } from "../types.js";
import { parseFragment } from "./markdown.js";
import { transform } from "./options.js";
import { readPackage, type PackageMetadata } from "./packageMetadata.js";
import { headingSchema, type HeadingOptions, packageSchema } from "./schemas.js";

/**
 * Generates instructions for the supported special package exports.
 *
 * @param packageMetadata - The package metadata that defines the exports.
 * @param options - The section heading options.
 * @param context - The services and destination details for the transform.
 * @returns Import guidance nodes, or an empty array when no special exports exist.
 */
export function generateImportInstructions(
	packageMetadata: PackageMetadata,
	options: HeadingOptions,
	context: TransformContext,
): RootContent[] {
	const packageExports = packageMetadata.exports;
	if (
		packageExports === undefined ||
		packageExports === null ||
		typeof packageExports !== "object"
	) {
		return [];
	}
	const specialExports = ["beta", "alpha", "legacy"].filter(
		(name) => `./${name}` in packageExports,
	);
	if (specialExports.length === 0) {
		return [];
	}
	const packageName = packageMetadata.name;
	const heading = options.includeHeading
		? `${"#".repeat(context.sectionHeadingDepth)} Importing from this package\n\n`
		: "";
	const paragraphs = [
		"This package uses [package.json exports](https://nodejs.org/api/packages.html#exports) to separate APIs by support level.\nFor information about the support guarantees, read [API Support Levels](https://fluidframework.com/docs/build/releases-and-apitags/#api-support-levels).",
		`Import the \`public\` APIs from \`${packageName}\`.`,
		...specialExports.map(
			(name) => `Import the \`${name}\` APIs from \`${packageName}/${name}\`.`,
		),
	];
	return parseFragment(`${heading}${paragraphs.join("\n\n")}`, context, "import-instructions");
}

/**
 * Generates import guidance from package metadata.
 */
export const importInstructionsTransform: Transform = transform(
	"import-instructions",
	{ ...packageSchema, ...headingSchema },
	async (options, context) =>
		generateImportInstructions(await readPackage(context, options), options, context),
);
