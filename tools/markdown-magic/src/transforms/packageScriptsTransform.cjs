/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

const scripts = require("markdown-magic-package-scripts");

const {
	formattedGeneratedContentBody,
	formattedSectionText,
	parseHeadingOptions,
} = require("../utilities.cjs");

/**
 * Generates a simple Markdown heading and contents with a table describing all of the package's npm scripts.
 *
 * @param {string} scriptsTable - Table of scripts to display.
 * See `markdown-magic-package-scripts` (imported as `scripts`).
 * @param {object} headingOptions - Heading generation options.
 * @param {boolean} headingOptions.includeHeading - Whether or not to include a top-level heading in the generated section.
 * @param {number} headingOptions.headingLevel - Root heading level for the generated section.
 * Must be a positive integer.
 */
const generatePackageScriptsSection = (scriptsTable, headingOptions) => {
	return formattedSectionText(scriptsTable, {
		...headingOptions,
		headingText: "Scripts",
	});
};

/**
 * Generates a README section with a table enumerating the dev scripts in the specified package.json.
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
function packageScriptsTransform(content, options, config) {
	const headingOptions = parseHeadingOptions(options);
	const scriptsTable = scripts(content, options, config);
	return formattedGeneratedContentBody(
		generatePackageScriptsSection(scriptsTable, headingOptions),
	);
}

module.exports = {
	generatePackageScriptsSection,
	packageScriptsTransform,
};
