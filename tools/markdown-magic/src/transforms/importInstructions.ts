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

/** Generates instructions for the supported special package exports. */
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
		"This package leverages [package.json exports](https://nodejs.org/api/packages.html#exports) to separate its APIs by support level.\nFor more information on the related support guarantees, see [API Support Levels](https://fluidframework.com/docs/build/releases-and-apitags/#api-support-levels).",
		`To access the \`public\` ([SemVer](https://semver.org/)) APIs, import via \`${packageName}\` like normal.`,
		...specialExports.map(
			(name) => `To access the \`${name}\` APIs, import via \`${packageName}/${name}\`.`,
		),
	];
	return parseFragment(`${heading}${paragraphs.join("\n\n")}`, context, "import-instructions");
}

export const importInstructionsTransform: Transform = transform(
	"import-instructions",
	{ ...packageSchema, ...headingSchema },
	async (options, context) =>
		generateImportInstructions(await readPackage(context, options), options, context),
);
