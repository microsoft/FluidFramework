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
 * Generates setup steps for an example package.
 *
 * @param packageMetadata - The example package metadata.
 * @param usesTinylicious - Whether to include Tinylicious setup steps.
 * @param options - The section heading options.
 * @param context - The services and destination details for the transform.
 * @returns The generated setup instruction nodes.
 */
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
		"1. Run `corepack enable` to enable [Corepack](https://nodejs.org/docs/latest-v16.x/api/corepack.html).",
		"1. From the `FluidFramework` root directory, run `pnpm install`.",
		`1. From the \`FluidFramework\` root directory, run \`pnpm run build:fast --nolint\`.\n    - To build only this package, add the package name to the command:\n      \`pnpm run build:fast --nolint ${packageMetadata.name}\``,
	];
	if (usesTinylicious) {
		steps.push(
			"1. In a separate terminal, run `pnpm tinylicious` from this directory to start Tinylicious.",
			"1. If you use GitHub Codespaces in a browser, set the visibility of the Tinylicious port (7070) to `public`. Do not use `Private to Organization`. For instructions, read [Sharing a port](https://docs.github.com/en/codespaces/developing-in-a-codespace/forwarding-ports-in-your-codespace#sharing-a-port).",
		);
	}
	steps.push(
		"1. Run `pnpm start` from this directory.",
		"1. Open <http://localhost:8080> in a web browser.",
		"\nTo run the example with SharePoint, complete these steps:\n\n1. Follow the [webpack-fluid-loader instructions](https://github.com/microsoft/FluidFramework/blob/main/examples/utils/webpack-fluid-loader/README.md#sharepoint) to get authentication credentials.\n1. Run `pnpm start:spo` or `pnpm start:spo-df` from this directory.\n1. Open <http://localhost:8080> in a web browser.",
	);
	return parseFragment(
		`${heading}Complete these steps to run the example:\n\n${steps.join("\n")}`,
		context,
		"getting-started",
	);
}

/**
 * Generates example setup steps from package metadata and marker options.
 */
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
