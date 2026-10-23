/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { Heading, RootContent } from "mdast";

import type { TransformContext } from "../types.js";
import type { HeadingOptions } from "./schemas.js";

const templatesDirectory = path.join(
	path.dirname(fileURLToPath(import.meta.url)),
	"..",
	"templates",
);

/**
 * Reads and parses a shared Markdown template.
 *
 * @param templateName - The file name within the template directory.
 * @param context - The services and destination details for the transform.
 * @returns A clone of the parsed template nodes.
 */
export async function readTemplateNodes(
	templateName: string,
	context: TransformContext,
): Promise<RootContent[]> {
	const templatePath = path.join(templatesDirectory, templateName);
	const source = await readFile(templatePath, "utf8");
	return structuredClone(context.parseDocument(source, templatePath).tree.children);
}

/**
 * Creates a section from a template and adjusts nested heading depths.
 *
 * @param templateName - The file name within the template directory.
 * @param options - The section heading options.
 * @param headingText - The text for the optional section heading.
 * @param context - The services and destination details for the transform.
 * @returns The template nodes with heading depths adjusted for the destination.
 */
export async function generateTemplateSection(
	templateName: string,
	options: HeadingOptions,
	headingText: string,
	context: TransformContext,
): Promise<RootContent[]> {
	const nodes = await readTemplateNodes(templateName, context);
	for (const node of nodes) {
		if (node.type === "heading") {
			node.depth = (node.depth + context.sectionHeadingDepth) as Heading["depth"];
			if (node.depth > 6) {
				throw new TypeError(`Template heading depth exceeds 6.`);
			}
		}
	}
	return options.includeHeading
		? [
				{
					type: "heading",
					depth: context.sectionHeadingDepth,
					children: [{ type: "text", value: headingText }],
				},
				...nodes,
			]
		: nodes;
}
