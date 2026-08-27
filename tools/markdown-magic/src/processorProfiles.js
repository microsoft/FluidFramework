/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import path from "node:path";

import { remark } from "remark";
import remarkGfm from "remark-gfm";
import remarkMdx from "remark-mdx";

/**
 * A supported documentation format.
 *
 * @typedef {"markdown" | "mdx"} DocumentFormat
 */

/**
 * Gets the document format from a file extension.
 *
 * @param {string} filePath - The document path.
 * @returns {DocumentFormat} The format for the document processor.
 * @throws If the file extension is not `.md`, `.markdown`, or `.mdx`.
 */
export function getDocumentFormat(filePath) {
	const extension = path.extname(filePath).toLowerCase();
	if (extension === ".mdx") {
		return "mdx";
	}
	if (extension === ".md" || extension === ".markdown") {
		return "markdown";
	}
	throw new Error(`Unsupported documentation file extension in "${filePath}".`);
}

/**
 * Creates a remark processor for Markdown or MDX with GitHub Flavored Markdown support.
 *
 * @param {DocumentFormat} format - The document format.
 * @returns {import("remark").Remark} The configured remark processor.
 */
export function createProcessor(format) {
	const processor = remark().use(remarkGfm, {
		// Use compact table delimiters to keep generated output stable.
		tablePipeAlign: false,
	});
	return format === "mdx" ? processor.use(remarkMdx) : processor;
}

/**
 * Parses a documentation file and retains the source details needed for range replacement.
 *
 * @param {string} source - The document source text.
 * @param {string} filePath - The document path. Its extension selects the parser.
 * @returns {{ format: DocumentFormat; path: string; source: string; tree: import("mdast").Root }} The parsed document.
 */
export function parseDocument(source, filePath) {
	const format = getDocumentFormat(filePath);
	return {
		format,
		path: filePath,
		source,
		tree: createProcessor(format).parse(source),
	};
}

/**
 * Runs and serializes generated root-content nodes with the selected processor.
 *
 * @param {readonly import("mdast").RootContent[]} nodes - The nodes to serialize.
 * @param {DocumentFormat} format - The destination document format.
 * @returns {Promise<string>} The serialized content without leading or trailing whitespace.
 */
export async function serializeNodes(nodes, format) {
	const processor = createProcessor(format);
	const tree = {
		type: "root",
		children: structuredClone(nodes),
	};
	const transformedTree = await processor.run(tree);
	return processor.stringify(transformedTree).trim();
}
