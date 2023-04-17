/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

const scripts = require("markdown-magic-package-scripts");

const { formattedGeneratedContentBody, formattedSectionText } = require("../utilities.cjs");

/**
 * Generats a simple Markdown heading and contents with a table describing all of the package's npm scripts.
 *
 * @param {string} scriptsTable - Table of scripts to display.
 * See `markdown-magic-package-scripts` (imported as `scripts`).
 * @param {boolean} includeHeading - Whether or not to include the heading in the generated contents.
 */
const generatePackageScriptsSection = (scriptsTable, includeHeading) => {
	return formattedSectionText(scriptsTable, includeHeading ? "Scripts" : undefined);
};

/**
 * Generates a README section with a table enumerating the dev scripts in the specified package.json.
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
function packageScriptsSectionTransform(content, options, config) {
	const includeHeading = options.includeHeading !== "FALSE";
	const scriptsTable = scripts(content, options, config);
	return formattedGeneratedContentBody(
		generatePackageScriptsSection(scriptsTable, includeHeading),
	);
}

module.exports = {
	generatePackageScriptsSection,
	packageScriptsSectionTransform,
};
