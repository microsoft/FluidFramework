/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

const { defaultSectionHeadingLevel } = require("../constants.cjs");
const {
	formattedGeneratedContentBody,
	formattedSectionText,
	getPackageMetadata,
	resolveRelativePackageJsonPath,
	parseHeadingOptions,
} = require("../utilities.cjs");

/**
 * Generates a simple Markdown heading and contents with package installation instructions.
 *
 * @param {string} packageName - Name of the package (fully scoped).
 * @param {boolean} devDependency - Whether or not the package is intended to be installed as a dev dependency.
 * @param {object} headingOptions - Heading generation options.
 * @param {boolean} headingOptions.includeHeading - Whether or not to include a top-level heading in the generated section.
 * @param {number} headingOptions.headingLevel - Root heading level for the generated section.
 * Must be a positive integer.
 */
const generateInstallationInstructionsSection = (
	packageName,
	devDependency,
	headingOptions,
) => {
	const sectionBody = `To get started, install the package by running the following command:

\`\`\`bash
npm i ${packageName}${devDependency ? " -D" : ""}
\`\`\``;

	return formattedSectionText(sectionBody, {
		...headingOptions,
		headingText: "Installation",
	});
};

/**
 * Generates a README section with package installation instructions.
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
 * @param {"TRUE" | "FALSE" | undefined} options.devDependency - (optional) Whether or not the package is intended to be installed as a dev dependency.
 * Default: `FALSE`.
 * @param {object} config - Transform configuration.
 * @param {string} config.originalPath - Path to the document being modified.
 */
function installationInstructionsTransform(content, options, config) {
	const headingOptions = parseHeadingOptions(options);
	const devDependency = options.devDependency === "TRUE";

	const resolvedPackageJsonPath = resolveRelativePackageJsonPath(
		config.originalPath,
		options.packageJsonPath,
	);
	const packageMetadata = getPackageMetadata(resolvedPackageJsonPath);

	const packageName = packageMetadata.name;
	return formattedGeneratedContentBody(
		generateInstallationInstructionsSection(packageName, devDependency, headingOptions),
	);
}

module.exports = {
	generateInstallationInstructionsSection,
	installationInstructionsTransform,
};
