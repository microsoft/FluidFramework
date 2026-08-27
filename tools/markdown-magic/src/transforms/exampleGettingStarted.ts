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

/** Generates setup steps for an example package. */
export function generateGettingStarted(
	packageMetadata: PackageMetadata,
	usesTinylicious: boolean,
	options: HeadingOptions,
	context: TransformContext,
): RootContent[] {
	const heading = options.includeHeading
		? `${"#".repeat(context.sectionHeadingDepth)} Getting Started\n\n`
		: "";
	const steps = [
		"1. Enable [corepack](https://nodejs.org/docs/latest-v16.x/api/corepack.html) by running `corepack enable`.",
		`1. Run \`pnpm install\` and \`pnpm run build:fast --nolint\` from the \`FluidFramework\` root directory.\n    - For an even faster build, you can add the package name to the build command, like this:\n      \`pnpm run build:fast --nolint ${packageMetadata.name}\``,
	];
	if (usesTinylicious) {
		steps.push(
			"1. In a separate terminal, start a Tinylicious server by running `pnpm tinylicious` in this directory.",
			'1. If using codespaces in a browser, set tinylicious (port 7070) visibility to "public". "Private to Organization" will not work. See [sharing a port](https://docs.github.com/en/codespaces/developing-in-a-codespace/forwarding-ports-in-your-codespace#sharing-a-port) for how to do this.',
		);
	}
	steps.push(
		"1. Run `pnpm start` from this directory and open <http://localhost:8080> in a web browser to see the app running.",
		"1. If you want to run the app against SharePoint, follow the instructions in [webpack-fluid-loader](https://github.com/microsoft/FluidFramework/blob/main/examples/utils/webpack-fluid-loader/README.md#sharepoint) to get auth credentials. Then run `pnpm start:spo` or `pnpm start:spo-df` and open <http://localhost:8080> like above.",
	);
	return parseFragment(
		`${heading}You can run this example using the following steps:\n\n${steps.join("\n")}`,
		context,
		"getting-started",
	);
}

export const exampleGettingStartedTransform: Transform = transform(
	"example-getting-started",
	{
		...packageSchema,
		...headingSchema,
		usesTinylicious: { type: "boolean", default: true },
	},
	async (options, context) =>
		generateGettingStarted(
			await readPackage(context, options),
			options.usesTinylicious,
			options,
			context,
		),
);
