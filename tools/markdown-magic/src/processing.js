/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { readFile, writeFile } from "node:fs/promises";

import { parseDocument, serializeNodes } from "./processorProfiles.js";
import { findGeneratedRegions } from "./regions.js";

const generatedContentNotice =
	"NOTE: This section is automatically generated using @fluid-tools/markdown-magic. Do not update these generated contents directly.";

/**
 * @param {"markdown" | "mdx"} format
 * @param {string} value
 */
function commentNode(format, value) {
	return format === "mdx"
		? { type: "mdxFlowExpression", value: `/* ${value} */` }
		: { type: "html", value: `<!-- ${value} -->` };
}

/**
 * @param {import("mdast").Nodes} node
 */
function containsMdxNode(node) {
	if (node.type.startsWith("mdx")) {
		return true;
	}
	return "children" in node && node.children.some((child) => containsMdxNode(child));
}

/**
 * @param {readonly import("mdast").RootContent[]} nodes
 * @param {"markdown" | "mdx"} destinationFormat
 * @param {string} sourcePath
 * @param {string} destinationPath
 */
function validateDestinationCompatibility(
	nodes,
	destinationFormat,
	sourcePath,
	destinationPath,
) {
	if (destinationFormat === "markdown" && nodes.some((node) => containsMdxNode(node))) {
		throw new Error(
			`MDX content from "${sourcePath}" cannot be generated in Markdown document "${destinationPath}".`,
		);
	}
}

/**
 * @param {readonly import("mdast").RootContent[]} nodes
 * @param {"markdown" | "mdx"} format
 */
async function serializeGeneratedBody(nodes, format) {
	const wrappedNodes = [
		commentNode(format, "prettier-ignore-start"),
		commentNode(format, generatedContentNotice),
		...nodes,
		commentNode(format, "prettier-ignore-end"),
	];
	const serialized = await serializeNodes(wrappedNodes, format);
	parseDocument(serialized, format === "mdx" ? "generated.mdx" : "generated.md");
	return `\n\n${serialized}\n\n`;
}

/**
 * @param {string} filePath
 * @param {ReturnType<import("./transformRegistry.js").createTransformRegistry>} registry
 */
export async function processDocument(filePath, registry) {
	const source = await readFile(filePath, "utf8");
	const document = parseDocument(source, filePath);
	const regions = findGeneratedRegions(document);
	const replacements = [];

	for (const region of regions) {
		const transform = registry[region.transformName];
		if (transform === undefined || typeof transform !== "object") {
			throw new Error(
				`${filePath}:${region.line}: Unknown transform "${region.transformName}".`,
			);
		}
		const options = transform.validateOptions(region.options);
		const context = registry.createContext(filePath, region.destinationFormat);
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
	for (const replacement of replacements.sort((left, right) => right.start - left.start)) {
		output = `${output.slice(0, replacement.start)}${replacement.content}${output.slice(replacement.end)}`;
	}

	if (output !== source) {
		await writeFile(filePath, output);
	}
	return output !== source;
}
