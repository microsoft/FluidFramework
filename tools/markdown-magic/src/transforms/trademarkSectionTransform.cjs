/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

const {
	formattedGeneratedContentBody,
	formattedSectionText,
	readTemplate,
} = require("../utilities.cjs");

/**
 * Generates a simple Markdown heading and contents with trademark information.
 *
 * @param {boolean} includeHeading - Whether or not to include the heading in the generated contents.
 */
const generateTrademarkSection = (includeHeading) => {
	const sectionBody = readTemplate("Trademark-Template.md");
	return formattedSectionText(sectionBody, includeHeading ? "Trademark" : undefined);
};

/**
 * Generates a README section with Microsoft trademark info.
 *
 * @param {object} content - The original document file contents.
 * @param {object} options - Transform options.
 * @param {"TRUE" | "FALSE" | undefined} options.includeHeading - (optional) Whether or not to include a Markdown heading with the generated section contents.
 * Default: `TRUE`.
 * @param {object} config - Transform configuration.
 * @param {string} config.originalPath - Path to the document being modified.
 */
function trademarkSectionTransform(content, options, config) {
	const includeHeading = options.includeHeading !== "FALSE";
	return formattedGeneratedContentBody(generateTrademarkSection(includeHeading));
}

module.exports = {
	generateTrademarkSection,
	trademarkSectionTransform,
};
