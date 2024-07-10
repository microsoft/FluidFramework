/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

const fs = require("fs");
const {
	formattedEmbeddedContentBody,
	formattedSectionText,
	resolveRelativePath,
} = require("../utilities.cjs");

/**
 * Embeds contents from the specified file paths within the provided (optional) line boundaries.
 *
 * @param {object} content - The original document file contents.
 * @param {object} options - Transform options.
 * @param {string} options.path - Relative path from the document to the file being embedded.
 * @param {string | undefined} options.start - (optional) First line from the target file to be embedded (inclusive).
 * Expected to be a string-formatted integer.
 * Default: 0.
 * Constraints are the same as those for the `end` parameter to
 * {@link https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/slice#parameters | Array.slice}
 * @param {string | undefined} options.end - (optional) Line of the target file at which to end the embedded range (exclusive).
 * Expected to be a string-formatted integer.
 * Default: <file-line-count> + 1.
 * Constraints are the same as those for the `end` parameter to
 * {@link https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/slice#parameters | Array.slice}
 * @param {object} config - Transform configuration.
 * @param {string} config.originalPath - Path to the document being modified.
 */
function includeTransform(content, options, config) {
	const { path: relativeFilePath, start: startLineString, end: endLineString } = options;
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
		let fileContents = fs.readFileSync(resolvedFilePath, "utf8");
		if (startLine || endLine) {
			const split = fileContents.split(/\r?\n/);
			fileContents = split.slice(startLine, endLine).join("\n");
		}
		const section = formattedSectionText(fileContents.trim(), /* headingOptions: */ undefined);

		return formattedEmbeddedContentBody(section);
	} catch (error) {
		console.error(`Exception processing "${resolvedFilePath}":`, error);
		throw error;
	}
}

module.exports = { includeTransform };
