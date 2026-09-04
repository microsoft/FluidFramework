/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import path from "node:path";

import { remark } from "remark";
import remarkGfm from "remark-gfm";
import remarkMdx from "remark-mdx";
import type { Root, RootContent } from "mdast";

import type { DocumentFormat, ParsedDocument } from "./types.js";

/**
 * Gets the document format from a file extension.
 *
 * @param filePath - The document path.
 * @returns The document format selected from the path extension.
 * @throws If the file extension is not `.md`, `.markdown`, or `.mdx`.
 */
export function getDocumentFormat(filePath: string): DocumentFormat {
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
 * @param format - The document format.
 * @returns A remark processor configured for the selected format and GitHub Flavored Markdown.
 */
export function createProcessor(format: DocumentFormat) {
	const processor = remark().use(remarkGfm, {
		// Use compact table delimiters to keep generated output stable.
		tablePipeAlign: false,
	});
	return format === "mdx" ? processor.use(remarkMdx) : processor;
}

/**
 * Parses a documentation file and retains the source details needed for range replacement.
 *
 * @param source - The document source text.
 * @param filePath - The document path. Its extension selects the parser.
 * @returns The parsed document and the source details needed for range replacement.
 */
export function parseDocument(source: string, filePath: string): ParsedDocument {
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
 * @param nodes - The nodes to serialize.
 * @param format - The destination document format.
 * @returns The serialized content without leading or trailing whitespace.
 */
export async function serializeNodes(
	nodes: readonly RootContent[],
	format: DocumentFormat,
): Promise<string> {
	const processor = createProcessor(format);
	const tree: Root = {
		type: "root",
		children: structuredClone([...nodes]),
	};
	const transformedTree = await processor.run(tree);
	return processor.stringify(transformedTree as Root).trim();
}
