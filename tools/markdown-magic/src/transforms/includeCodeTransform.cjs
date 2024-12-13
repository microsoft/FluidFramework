/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

const fs = require("fs");
const {
	formattedEmbeddedContentBody,
	formattedSectionText,
	readFile,
	resolveRelativePath,
} = require("../utilities.cjs");

/**
 * Embeds contents from the specified file paths within the provided (optional) line boundaries.
 *
 * @param {object} content - The original document file contents.
 * @param {object} options - Transform options.
 * @param {string} options.path - Relative path from the document to the file being embedded.
 * @param {string | undefined} options.start - (optional) 0-based index of the first line from the target file to be embedded (inclusive).
 * Expected to be a string-formatted integer.
 * Default: Start from the first line of the file..
 * Constraints are the same as those for the `start` parameter to
 * {@link https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/slice#parameters | Array.slice}
 * @param {string | undefined} options.end - (optional) 0-based index of the last line of the target file to be embedded (exclusive).
 * Expected to be a string-formatted integer.
 * Default: Include through the last line of the file.
 * Constraints are the same as those for the `end` parameter to
 * {@link https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/slice#parameters | Array.slice}
 * @param {string | undefined} options.language - The code language to use for syntax highlighting.
 * E.g., "language=typescript" would yield a markdown codeblock starting with "\`\`\`typescript".
 * Default: No language specified.
 * @param {object} config - Transform configuration.
 * @param {string} config.originalPath - Path to the document being modified.
 */
function includeCodeTransform(content, options, config) {
	const { path: relativeFilePath, start: startLineString, end: endLineString, language } = options;
	const { originalPath: documentFilePath } = config;

	const startLine = startLineString === undefined ? undefined : Number.parseInt(startLineString);
	const endLine = endLineString === undefined ? undefined : Number.parseInt(endLineString);

	if (!relativeFilePath) {
		throw new Error(
			"No 'path' parameter provided. Must specify a relative path to the file containing the contents to be embedded.",
		);
	}

	const resolvedFilePath = resolveRelativePath(documentFilePath, relativeFilePath);

	try {
		const fileContents = readFile(resolvedFilePath, startLine, endLine);

		const codeBlock = [
			`\`\`\`${language ?? ""}`,
			fileContents,
			"```",
		].join("\n");

		const section = formattedSectionText(codeBlock, /* headingOptions: */ undefined);

		return formattedEmbeddedContentBody(section);
	} catch (error) {
		console.error(`Exception processing "${resolvedFilePath}":`, error);
		throw error;
	}
}

module.exports = { includeCodeTransform };
