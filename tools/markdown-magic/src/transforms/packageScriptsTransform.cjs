/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

const scripts = require("markdown-magic-package-scripts");

const { defaultSectionHeadingLevel } = require("../constants.cjs");
const {
	formattedGeneratedContentBody,
	formattedSectionText,
	parseIntegerOptionOrDefault,
} = require("../utilities.cjs");

/**
 * Generates a simple Markdown heading and contents with a table describing all of the package's npm scripts.
 *
 * @param {string} scriptsTable - Table of scripts to display.
 * See `markdown-magic-package-scripts` (imported as `scripts`).
 * @param {number} headingLevel - Root heading level for the generated section.
 * If 0, no heading will be included.
 * Must be a non-negative integer.
 */
const generatePackageScriptsSection = (scriptsTable, headingLevel) => {
	return formattedSectionText(scriptsTable, {
		headingLevel: headingLevel,
		headingText: "Scripts",
	});
};

/**
 * Generates a README section with a table enumerating the dev scripts in the specified package.json.
 *s
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
function packageScriptsSectionTransform(content, options, config) {
	const headingLevel = parseIntegerOptionOrDefault(
		options.headingLevel,
		defaultSectionHeadingLevel,
	);
	const scriptsTable = scripts(content, options, config);
	return formattedGeneratedContentBody(generatePackageScriptsSection(scriptsTable, headingLevel));
}

module.exports = {
	generatePackageScriptsSection,
	packageScriptsSectionTransform,
};
