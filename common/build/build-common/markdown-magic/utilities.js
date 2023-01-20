/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

const fs = require("fs");
const path = require("path");

const { embeddedContentNotice, generatedContentNotice } = require("./constants");

/**
 * Resolves the provided relative path from its document path.
 *
 * @param {string} documentPath - The path to the document this system is modifying.
 * @param {string} relativePath - A path, relative to `documentPath`, to resolve.
 */
function resolveRelativePath(documentPath, relativePath) {
	return path.resolve(path.dirname(documentPath), relativePath);
}

/**
 * Gets the package's `package.json` contents, given the path to its package.json file.
 *
 * @param {string} packageJsonFilePath - Path to a `package.json` file.
 */
function getPackageMetadata(packageJsonFilePath) {
	try {
		const packageJson = JSON.parse(fs.readFileSync(packageJsonFilePath, "utf8"));
		return packageJson;
	} catch (error) {
		console.error(error);
		throw error;
	}
}

/**
 * Gets a package short-name (unscoped-name) from a scoped package name.
 *
 * @param {string} scopedPackageName - A scoped package name.
 */
function getShortPackageName(scopedPackageName) {
	const arr = scopedPackageName.split("/", 2);
	if (arr[1]) {
		return arr[1];
	}
	return arr[0];
}

/**
 * Gets the path (relative to the `docs` directory) to the package directory given the path to its `package.json` file.
 *
 * @param {string} packageJsonPath - Path to the package's `package.json` file.
 */
function getPackageDirectoryPath(packageJsonPath) {
	return path.dirname(packageJsonPath);
}

/**
 * Generates the appropriately formatted Markdown section contents for the provided section body.
 * If header text is provided, a level 2 heading (i.e. `##`) will be included with the provided text.
 * The section will be wrapped in leading and trailing newlines to ensure adequate spacing between generated contents.
 *
 * @param {string} sectionBody - Body text to include in the section.
 * @param {string | undefined} maybeHeaderText - (optional) header text to display.
 * If not provided, will not include header in output.
 */
function formattedSectionText(sectionBody, maybeHeaderText) {
	return `\n${maybeHeaderText === undefined ? "" : `## ${maybeHeaderText}\n\n`}${sectionBody}\n`;
}

/**
 * Wraps the provided generated / embedded content in prettier-ignore pragma comments.
 * @param {string} contents The Markdown contents to be wrapped.
 */
function bundlePrettierPragmas(contents) {
	return ["\n<!-- prettier-ignore-start -->", contents, "<!-- prettier-ignore-end -->\n"].join(
		"\n",
	);
}

/**
 * Bundles the provided generated contents with the {@link generatedContentNotice}, as well as
 * prettier-ignore pragmas to ensure there is not contention between our content generation and prettier's
 * formatting opinions.
 *
 * @param {string} contents - The generated Markdown contents to be included.
 */
function formattedGeneratedContentBody(contents) {
	return bundlePrettierPragmas([generatedContentNotice, contents].join("\n"));
}

/**
 * Bundles the provided generated contents with the {@link generatedContentNotice}, as well as
 * prettier-ignore pragmas to ensure there is not contention between our content generation and prettier's
 * formatting opinions.
 *
 * @param {string} contents - The generated Markdown contents to be included.
 */
function formattedEmbeddedContentBody(contents) {
	return bundlePrettierPragmas([embeddedContentNotice, contents].join("\n"));
}

module.exports = {
	resolveRelativePath,
	getPackageMetadata,
	getShortPackageName,
	getPackageDirectoryPath,
	formattedSectionText,
	formattedGeneratedContentBody,
	formattedEmbeddedContentBody,
};
