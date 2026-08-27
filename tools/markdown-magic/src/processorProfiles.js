/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import path from "node:path";

import { remark } from "remark";
import remarkGfm from "remark-gfm";
import remarkMdx from "remark-mdx";

/**
 * @typedef {"markdown" | "mdx"} DocumentFormat
 */

/**
 * @param {string} filePath
 * @returns {DocumentFormat}
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
 * @param {DocumentFormat} format
 */
export function createProcessor(format) {
	const processor = remark().use(remarkGfm, {
		tablePipeAlign: false,
	});
	return format === "mdx" ? processor.use(remarkMdx) : processor;
}

/**
 * @param {string} source
 * @param {string} filePath
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
 * @param {readonly import("mdast").RootContent[]} nodes
 * @param {DocumentFormat} format
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
