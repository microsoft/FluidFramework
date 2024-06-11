/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

const { PackageName } = require("@rushstack/node-core-library");

const {
	formattedGeneratedContentBody,
	formattedSectionText,
	getPackageMetadata,
	resolveRelativePackageJsonPath,
} = require("../utilities.cjs");

/**
 * Generats a simple Markdown heading and contents with information about API documentation for the package.
 *
 * @param {string} packageName - Name of the package (fully scoped).
 * @param {boolean} includeHeading - Whether or not to include the heading in the generated contents.
 */
const generateApiDocsLinkSection = (packageName, includeHeading) => {
	const shortName = PackageName.getUnscopedName(packageName);
	const sectionBody = `API documentation for **${packageName}** is available at <https://fluidframework.com/docs/apis/${shortName}>.`;
	return formattedSectionText(sectionBody, includeHeading ? "API Documentation" : undefined);
};

/**
 * Generates a README section pointing readers to the published library API docs on <fluidframework.com>.
 *
 * @param {object} content - The original document file contents.
 * @param {object} options - Transform options.
 * @param {string} options.packageJsonPath - (optional) Relative file path to the package.json file for the package.
 * Default: "./package.json".
 * @param {"TRUE" | "FALSE" | undefined} options.includeHeading - (optional) Whether or not to include a Markdown heading with the generated section contents.
 * Default: `TRUE`.
 * @param {object} config - Transform configuration.
 * @param {string} config.originalPath - Path to the document being modified.
 */
function apiDocsLinkSectionTransform(content, options, config) {
	const includeHeading = options.includeHeading !== "FALSE";

	const resolvedPackageJsonPath = resolveRelativePackageJsonPath(
		config.originalPath,
		options.packageJsonPath,
	);
	const packageMetadata = getPackageMetadata(resolvedPackageJsonPath);
	const packageName = packageMetadata.name;

	return formattedGeneratedContentBody(generateApiDocsLinkSection(packageName, includeHeading));
}

module.exports = {
	generateApiDocsLinkSection,
	apiDocsLinkSectionTransform,
};
