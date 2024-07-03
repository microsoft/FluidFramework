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
 * Generates a simple Markdown heading and contents with a section pointing developers to other sources of documentation,
 * and to our issue tracker.
 *
 * @param {boolean} includeHeading - Whether or not to include the heading in the generated contents.
 */
const generateHelpSection = (includeHeading) => {
	const sectionBody = readTemplate("Help-Template.md");
	return formattedSectionText(sectionBody, includeHeading ? "Help" : undefined);
};

/**
 * Generates a README "help" section.
 *
 * @param {object} content - The original document file contents.
 * @param {object} options - Transform options.
 * @param {"TRUE" | "FALSE" | undefined} options.includeHeading - (optional) Whether or not to include a Markdown heading with the generated section contents.
 * Default: `TRUE`.
 * @param {object} config - Transform configuration.
 * @param {string} config.originalPath - Path to the document being modified.
 */
function helpSectionTransform(content, options, config) {
	const includeHeading = options.includeHeading !== "FALSE";
	return formattedGeneratedContentBody(generateHelpSection(includeHeading));
}

module.exports = {
	generateHelpSection,
	helpSectionTransform,
};
