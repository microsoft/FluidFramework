/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

const { PackageName } = require("@rushstack/node-core-library");

const { defaultSectionHeadingLevel } = require("../constants.cjs");
const {
	formattedGeneratedContentBody,
	formattedSectionText,
	getPackageMetadata,
	parseIntegerOptionOrDefault,
	resolveRelativePackageJsonPath,
} = require("../utilities.cjs");

/**
 * Generates a simple Markdown heading and contents with information about API documentation for the package.
 *
 * @param {string} packageName - Name of the package (fully scoped).
 * @param {number} headingLevel - Root heading level for the generated section.
 * If 0, no heading will be included.
 * Must be a non-negative integer.
 */
const generateApiDocsLinkSection = (packageName, headingLevel) => {
	const shortName = PackageName.getUnscopedName(packageName);
	const sectionBody = `API documentation for **${packageName}** is available at <https://fluidframework.com/docs/apis/${shortName}>.`;
	return formattedSectionText(sectionBody, { headingLevel, headingText: "API Documentation" });
};

/**
 * Generates a README section pointing readers to the published library API docs on <fluidframework.com>.
 *
 * @param {object} content - The original document file contents.
 * @param {object} options - Transform options.
 * @param {string} options.packageJsonPath - (optional) Relative file path to the package.json file for the package.
 * Default: "./package.json".
 * @param {number | undefined} options.headingLevel - (optional) Heading level for the section.
 * Must be a non-negative integer.
 * If 0, not heading will be included in the generated section.
 * Default: {@link defaultSectionHeadingLevel}.
 * @param {object} config - Transform configuration.
 * @param {string} config.originalPath - Path to the document being modified.
 */
function apiDocsLinkSectionTransform(content, options, config) {
	const headingLevel = parseIntegerOptionOrDefault(
		options.headingLevel,
		defaultSectionHeadingLevel,
	);

	const resolvedPackageJsonPath = resolveRelativePackageJsonPath(
		config.originalPath,
		options.packageJsonPath,
	);
	const packageMetadata = getPackageMetadata(resolvedPackageJsonPath);
	const packageName = packageMetadata.name;

	return formattedGeneratedContentBody(generateApiDocsLinkSection(packageName, headingLevel));
}

module.exports = {
	generateApiDocsLinkSection,
	apiDocsLinkSectionTransform,
};
