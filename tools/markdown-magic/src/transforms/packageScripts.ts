/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { RootContent } from "mdast";

import type { Transform, TransformContext } from "../types.js";
import { transform } from "./options.js";
import { readPackage } from "./packageMetadata.js";
import { headingSchema, type HeadingOptions, packageSchema } from "./schemas.js";

/** Generates a GitHub Flavored Markdown table of package scripts. */
export function generateScripts(
	scripts: Record<string, string>,
	options: HeadingOptions,
	context: TransformContext,
): RootContent[] {
	const rows: import("mdast").TableRow[] = Object.entries(scripts).map(([name, command]) => ({
		type: "tableRow",
		children: [name, command].map((value) => ({
			type: "tableCell",
			children: [{ type: "inlineCode", value }],
		})),
	}));
	const table: import("mdast").Table = {
		type: "table",
		align: [null, null],
		children: [
			{
				type: "tableRow",
				children: ["Script", "Description"].map((value) => ({
					type: "tableCell",
					children: [{ type: "text", value }],
				})),
			},
			...rows,
		],
	};
	return options.includeHeading
		? [
				{
					type: "heading",
					depth: context.sectionHeadingDepth,
					children: [{ type: "text", value: "Scripts" }],
				},
				table,
			]
		: [table];
}

export const packageScriptsTransform: Transform = transform(
	"package-scripts",
	{ ...packageSchema, ...headingSchema },
	async (options, context) => {
		const packageMetadata = await readPackage(context, options);
		return generateScripts(packageMetadata.scripts ?? {}, options, context);
	},
);
