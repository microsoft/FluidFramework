/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

const {
	formattedGeneratedContentBody,
	formattedSectionText,
	getPackageMetadata,
	resolveRelativePackageJsonPath,
} = require("../utilities.cjs");

/**
 * Generates a simple Markdown heading and contents with package installation instructions.
 *
 * @param {string} packageName - Name of the package (fully scoped).
 * @param {boolean} devDependency - Whether or not the package is intended to be installed as a dev dependency.
 * @param {boolean} includeHeading - Whether or not to include the heading in the generated contents.
 */
const generateInstallationInstructionsSection = (packageName, devDependency, includeHeading) => {
	const sectionBody = `To get started, install the package by running the following command:

\`\`\`bash
npm i ${packageName}${devDependency ? " -D" : ""}
\`\`\``;

	return formattedSectionText(sectionBody, includeHeading ? "Installation" : undefined);
};

/**
 * Generates a README section with package installation instructions.
 *
 * @param {object} content - The original document file contents.
 * @param {object} options - Transform options.
 * @param {string} options.packageJsonPath - (optional) Relative file path to the package.json file for the package.
 * Default: "./package.json".
 * @param {"TRUE" | "FALSE" | undefined} options.includeHeading - (optional) Whether or not to include a Markdown heading with the generated section contents.
 * Default: `TRUE`.
 * @param {"TRUE" | "FALSE" | undefined} options.devDependency - (optional) Whether or not the package is intended to be installed as a dev dependency.
 * Default: `FALSE`.
 * @param {object} config - Transform configuration.
 * @param {string} config.originalPath - Path to the document being modified.
 */
function installationInstructionsTransform(content, options, config) {
	const includeHeading = options.includeHeading !== "FALSE";
	const devDependency = options.devDependency === "TRUE";

	const resolvedPackageJsonPath = resolveRelativePackageJsonPath(
		config.originalPath,
		options.packageJsonPath,
	);
	const packageMetadata = getPackageMetadata(resolvedPackageJsonPath);

	const packageName = packageMetadata.name;
	return formattedGeneratedContentBody(
		generateInstallationInstructionsSection(packageName, devDependency, includeHeading),
	);
}

module.exports = {
	generateInstallationInstructionsSection,
	installationInstructionsTransform,
};
