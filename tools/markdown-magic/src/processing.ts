/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { readFile, writeFile } from "node:fs/promises";

import type { RootContent } from "mdast";

import { inferSectionHeadingDepth } from "./headings.js";
import { parseDocument, serializeNodes } from "./processorProfiles.js";
import { findGeneratedRegions } from "./regions.js";
import type { DocumentFormat, TransformRegistry } from "./types.js";

const generatedContentNotice =
	"NOTE: This section is automatically generated using @fluid-tools/markdown-magic. Do not update these generated contents directly.";

/**
 * Creates a comment node for the selected document format.
 *
 * @param format - The destination document format.
 * @param value - The comment text without comment delimiters.
 * @returns An HTML or MDX comment node for the selected format.
 */
function commentNode(format: DocumentFormat, value: string): RootContent {
	return format === "mdx"
		? { type: "mdxFlowExpression", value: `/* ${value} */` }
		: { type: "html", value: `<!-- ${value} -->` };
}

/**
 * Adds generated-content notices and serializes one generated region.
 *
 * @param nodes - The transform output.
 * @param format - The destination document format.
 * @param sourcePath - The source path to include in an error.
 * @param destinationPath - The destination path to include in an error.
 * @returns The serialized region body with boundary blank lines.
 */
async function serializeGeneratedBody(
	nodes: readonly RootContent[],
	format: DocumentFormat,
	sourcePath: string,
	destinationPath: string,
): Promise<string> {
	const wrappedNodes: RootContent[] = [
		commentNode(format, "prettier-ignore-start"),
		commentNode(format, generatedContentNotice),
		...nodes,
		commentNode(format, "prettier-ignore-end"),
	];
	let serialized: string;
	try {
		// Remark does not expose a capability check for node types. Serialization is its
		// authoritative compatibility check and automatically covers node types added later.
		serialized = await serializeNodes(wrappedNodes, format);
	} catch (error) {
		const formatName = format === "mdx" ? "MDX" : "Markdown";
		throw new Error(
			`Content from "${sourcePath}" cannot be generated in ${formatName} document "${destinationPath}".`,
			{ cause: error },
		);
	}
	// Parse the output before any write so invalid generated syntax cannot replace valid content.
	parseDocument(serialized, format === "mdx" ? "generated.mdx" : "generated.md");
	return `\n\n${serialized}\n\n`;
}

/**
 * Updates all generated regions in one documentation file.
 *
 * The function validates and generates every region before it writes the file. A failure does not
 * cause a partial write to this file.
 *
 * @param filePath - The path of the destination document.
 * @param registry - The available transforms and context factory.
 * @returns `true` if the file changed; otherwise, `false`.
 * @throws If reading, parsing, validation, generation, serialization, or writing fails.
 */
export async function processDocument(
	filePath: string,
	registry: TransformRegistry,
): Promise<boolean> {
	const source = await readFile(filePath, "utf8");
	const document = parseDocument(source, filePath);
	const regions = findGeneratedRegions(document);
	const replacements: { start: number; end: number; content: string }[] = [];

	for (const region of regions) {
		const transform = registry.transforms[region.transformName];
		if (transform === undefined) {
			throw new Error(
				`${filePath}:${region.line}: Unknown transform "${region.transformName}".`,
			);
		}
		const context = registry.createContext(
			filePath,
			region.destinationFormat,
			inferSectionHeadingDepth(document, regions, region),
		);
		const nodes = await transform.generate(region.options, context);
		const sourcePath = nodes.sourcePath ?? filePath;
		replacements.push({
			start: region.openingMarkerEnd,
			end: region.closingMarkerStart,
			content: await serializeGeneratedBody(
				nodes,
				region.destinationFormat,
				sourcePath,
				filePath,
			),
		});
	}

	let output = source;
	// Apply replacements from the end of the file so that earlier offsets remain valid.
	for (const replacement of replacements.sort((left, right) => right.start - left.start)) {
		output = `${output.slice(0, replacement.start)}${replacement.content}${output.slice(replacement.end)}`;
	}

	if (output !== source) {
		await writeFile(filePath, output);
	}
	return output !== source;
}
