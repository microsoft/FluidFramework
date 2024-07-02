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
 * Generates a simple Markdown heading and contents with information about how to import from the package's export options.
 *
 * Note: this function will only generate contents if one of our special export paths is found (`/alpha`, `/beta`, or `/legacy`).
 *
 * @param {object} packageMetadata - package.json file contents.
 * @param {boolean} includeHeading - Whether or not to include the heading in the generated contents.
 */
const generatePackageImportInstructionsSection = (packageMetadata, includeHeading) => {
	const packageName = packageMetadata.name;
	const packageExports = packageMetadata.exports;

	// If the package.json doesn't include an exports block, don't generate anything.
	if (!packageExports) {
		return "";
	}

	// Currently assumes the package has a `.` export path.
	// Does not look for custom paths, only our 3 standard ones.
	const hasAlphaExport = "./alpha" in packageExports;
	const hasBetaExport = "./beta" in packageExports;
	const hasLegacyExport = "./legacy" in packageExports;

	// If the package.json's exports block doesn't include one of our special paths, don't generate anything.
	if (!(hasAlphaExport || hasBetaExport || hasLegacyExport)) {
		return "";
	}

	const lines = [
		"This package leverages [package.json exports](https://nodejs.org/api/packages.html#exports) to separate its APIs by support level.",
		"For more information on the related support guarantees, see [API Support Levels](https://fluidframework.com/docs/build/releases-and-apitags/#api-support-levels).",
		"", // Blank line
		`To access the \`public\` ([SemVer](https://semver.org/)) APIs, import via \`${packageName}\` like normal.`,
	];

	if (hasBetaExport) {
		lines.push("", `To access the \`beta\` APIs, import via \`${packageName}/beta\`.`);
	}

	if (hasAlphaExport) {
		lines.push("", `To access the \`alpha\` APIs, import via \`${packageName}/alpha\`.`);
	}

	if (hasLegacyExport) {
		lines.push("", `To access the \`legacy\` APIs, import via \`${packageName}/legacy\`.`);
	}

	const sectionBody = lines.join("\n");

	return formattedSectionText(
		sectionBody,
		includeHeading ? "Importing from this package" : undefined,
	);
};

/**
 * Generates a README section with instructions for how to import different API support levels based on
 * our standard package export paths (`/alpha`, `/beta`, `/legacy`).
 *
 * Note: this function will only generate contents if one of our special export paths is found (`/alpha`, `/beta`, or `/legacy`).
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
function packageImportInstructionsSectionTransform(content, options, config) {
	const includeHeading = options.includeHeading !== "FALSE";

	const resolvedPackageJsonPath = resolveRelativePackageJsonPath(
		config.originalPath,
		options.packageJsonPath,
	);
	const packageMetadata = getPackageMetadata(resolvedPackageJsonPath);

	return formattedGeneratedContentBody(
		generatePackageImportInstructionsSection(packageMetadata, includeHeading),
	);
}

module.exports = {
	generatePackageImportInstructionsSection,
	packageImportInstructionsSectionTransform,
};
