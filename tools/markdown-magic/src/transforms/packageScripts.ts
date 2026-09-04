/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { PhrasingContent, RootContent, Table, TableRow } from "mdast";

import type { Transform, TransformContext } from "../types.js";
import { parseFragment } from "./markdown.js";
import { transform } from "./options.js";
import { readPackage } from "./packageMetadata.js";
import { headingSchema, type HeadingOptions, packageSchema } from "./schemas.js";

/**
 * Generates a GitHub Flavored Markdown table of package scripts.
 *
 * @param scripts - The package scripts indexed by command name.
 * @param scriptDescriptions - Optional descriptions indexed by command name.
 * @param options - The section heading options.
 * @param context - The services and destination details for the transform.
 * @returns The generated script table and optional heading.
 */
export function generateScripts(
	scripts: Record<string, string>,
	scriptDescriptions: Readonly<Record<string, string>>,
	options: HeadingOptions,
	context: TransformContext,
): RootContent[] {
	const rows: TableRow[] = Object.entries(scripts).map(([name, command]) => {
		const description = Object.hasOwn(scriptDescriptions, name)
			? scriptDescriptions[name]
			: undefined;
		let descriptionChildren: PhrasingContent[] = [];
		if (description !== undefined) {
			const descriptionNodes = parseFragment(description, context, "script-description");
			if (descriptionNodes.length !== 1 || descriptionNodes[0]?.type !== "paragraph") {
				throw new TypeError(`Description for script "${name}" must be inline Markdown.`);
			}
			descriptionChildren = descriptionNodes[0].children;
		}
		return {
			type: "tableRow",
			children: [
				{
					type: "tableCell",
					children: [{ type: "inlineCode", value: name }],
				},
				{
					type: "tableCell",
					children: [{ type: "inlineCode", value: command }],
				},
				{ type: "tableCell", children: descriptionChildren },
			],
		};
	});
	const table: Table = {
		type: "table",
		align: [null, null, null],
		children: [
			{
				type: "tableRow",
				children: ["Script Name", "Script Body", "Description"].map((value) => ({
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

/**
 * Generates a script table from package metadata.
 */
export const packageScriptsTransform: Transform = transform(
	"package-scripts",
	{
		...packageSchema,
		...headingSchema,
		scriptDescriptions: { type: "stringRecord", default: {} },
	},
	async (options, context) => {
		const packageMetadata = await readPackage(context, options);
		const scripts = packageMetadata.scripts ?? {};
		const unknownScript = Object.keys(options.scriptDescriptions).find(
			(name) => !Object.hasOwn(scripts, name),
		);
		if (unknownScript !== undefined) {
			throw new TypeError(`Description provided for unknown script "${unknownScript}".`);
		}
		return generateScripts(scripts, options.scriptDescriptions, options, context);
	},
);
