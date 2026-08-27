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

/** Generates package installation instructions. */
export function generateInstallation(
	packageName: string,
	devDependency: boolean,
	options: HeadingOptions,
	context: TransformContext,
): RootContent[] {
	const heading = options.includeHeading
		? `${"#".repeat(context.sectionHeadingDepth)} Installation\n\n`
		: "";
	return parseFragment(
		`${heading}To get started, install the package by running the following command:\n\n\`\`\`bash\nnpm i ${packageName}${devDependency ? " -D" : ""}\n\`\`\``,
		context,
		"installation",
	);
}

export const installationInstructionsTransform: Transform = transform(
	"installation-instructions",
	{ ...packageSchema, ...headingSchema, devDependency: { type: "boolean", default: false } },
	async (options, context) => {
		const packageMetadata = await readPackage(context, options);
		return generateInstallation(packageMetadata.name, options.devDependency, options, context);
	},
);
