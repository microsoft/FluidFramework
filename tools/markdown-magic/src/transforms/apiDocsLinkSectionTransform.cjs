/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

const { PackageName } = require("@rushstack/node-core-library");

const {
	formattedGeneratedContentBody,
	formattedSectionText,
	getPackageMetadata,
	parseHeadingOptions,
	resolveRelativePackageJsonPath,
} = require("../utilities.cjs");

/**
 * Generates a simple Markdown heading and contents with information about API documentation for the package.
 *
 * @param {string} packageName - Name of the package (fully scoped).
 * @param {object} headingOptions - Heading generation options.
 * @param {boolean} headingOptions.includeHeading - Whether or not to include a top-level heading in the generated section.
 * @param {number} headingOptions.headingLevel - Root heading level for the generated section.
 * Must be a positive integer.
 */
const generateApiDocsSection = (packageName, headingOptions) => {
	const shortName = PackageName.getUnscopedName(packageName);
	const sectionBody = `API documentation for **${packageName}** is available at <https://fluidframework.com/docs/apis/${shortName}>.`;
	return formattedSectionText(sectionBody, {
		...headingOptions,
		headingText: "API Documentation",
	});
};

/**
 * Generates a README section pointing readers to the published library API docs on <fluidframework.com>.
 *
 * @param {object} content - The original document file contents.
 * @param {object} options - Transform options.
 * @param {string} options.packageJsonPath - (optional) Relative file path to the package.json file for the package.
 * Default: "./package.json".
 * @param {"TRUE" | "FALSE" | undefined} includeHeading - (optional) Whether or not to include a top-level heading in the generated section.
 * default: `TRUE`.
 * @param {number | undefined} options.headingLevel - (optional) Heading level for the section.
 * Must be a positive integer.
 * Default: {@link defaultSectionHeadingLevel}.
 * @param {object} config - Transform configuration.
 * @param {string} config.originalPath - Path to the document being modified.
 */
function apiDocsTransform(content, options, config) {
	const headingOptions = parseHeadingOptions(options);
	const resolvedPackageJsonPath = resolveRelativePackageJsonPath(
		config.originalPath,
		options.packageJsonPath,
	);
	const packageMetadata = getPackageMetadata(resolvedPackageJsonPath);
	const packageName = packageMetadata.name;

	return formattedGeneratedContentBody(generateApiDocsSection(packageName, headingOptions));
}

module.exports = {
	generateApiDocsSection,
	apiDocsTransform,
};
