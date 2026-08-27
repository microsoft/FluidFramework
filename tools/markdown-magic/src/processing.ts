/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { readFile, writeFile } from "node:fs/promises";

import { inferSectionHeadingDepth } from "./headings.js";
import { parseDocument, serializeNodes } from "./processorProfiles.js";
import { findGeneratedRegions } from "./regions.js";
import type { DocumentFormat, TransformRegistry } from "./types.js";

const generatedContentNotice =
	"NOTE: This section is automatically generated using @fluid-tools/markdown-magic. Do not update these generated contents directly.";

/**
 * Creates a comment node for the selected document format.
 *
 * @param {"markdown" | "mdx"} format - The destination document format.
 * @param {string} value - The comment text without comment delimiters.
 * @returns {import("mdast").RootContent} The HTML or MDX comment node.
 */
function commentNode(format: DocumentFormat, value: string): import("mdast").RootContent {
	return format === "mdx"
		? { type: "mdxFlowExpression", value: `/* ${value} */` }
		: { type: "html", value: `<!-- ${value} -->` };
}

/**
 * Tests whether a syntax-tree node contains MDX-specific syntax.
 *
 * @param {import("mdast").Nodes} node - The node to inspect.
 * @returns {boolean} `true` if the node or one of its descendants is an MDX node.
 */
function containsMdxNode(node: import("mdast").Nodes): boolean {
	if (node.type.startsWith("mdx")) {
		return true;
	}
	return "children" in node && node.children.some((child) => containsMdxNode(child));
}

/**
 * Verifies that the destination processor can serialize the generated nodes.
 *
 * @param {readonly import("mdast").RootContent[]} nodes - The generated nodes.
 * @param {"markdown" | "mdx"} destinationFormat - The destination document format.
 * @param {string} sourcePath - The source path to include in an error.
 * @param {string} destinationPath - The destination path to include in an error.
 */
function validateDestinationCompatibility(
	nodes: readonly import("mdast").RootContent[],
	destinationFormat: DocumentFormat,
	sourcePath: string,
	destinationPath: string,
): void {
	if (destinationFormat === "markdown" && nodes.some((node) => containsMdxNode(node))) {
		throw new Error(
			`MDX content from "${sourcePath}" cannot be generated in Markdown document "${destinationPath}".`,
		);
	}
}

/**
 * Adds generated-content notices and serializes one generated region.
 *
 * @param {readonly import("mdast").RootContent[]} nodes - The transform output.
 * @param {"markdown" | "mdx"} format - The destination document format.
 * @returns {Promise<string>} The serialized region body with boundary blank lines.
 */
async function serializeGeneratedBody(
	nodes: readonly import("mdast").RootContent[],
	format: DocumentFormat,
): Promise<string> {
	const wrappedNodes: import("mdast").RootContent[] = [
		commentNode(format, "prettier-ignore-start"),
		commentNode(format, generatedContentNotice),
		...nodes,
		commentNode(format, "prettier-ignore-end"),
	];
	const serialized = await serializeNodes(wrappedNodes, format);
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
 * @param {string} filePath - The path of the destination document.
 * @param {ReturnType<import("./transformRegistry.js").createTransformRegistry>} registry - The available transforms and context factory.
 * @returns {Promise<boolean>} `true` if the file changed.
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
		const options = transform.validateOptions(region.options);
		const context = registry.createContext(
			filePath,
			region.destinationFormat,
			inferSectionHeadingDepth(document, regions, region),
		);
		const nodes = await transform.generate(options, context);
		const sourcePath = nodes.sourcePath ?? filePath;
		validateDestinationCompatibility(nodes, region.destinationFormat, sourcePath, filePath);
		replacements.push({
			start: region.openingMarkerEnd,
			end: region.closingMarkerStart,
			content: await serializeGeneratedBody(nodes, region.destinationFormat),
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
