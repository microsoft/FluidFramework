/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

const { formattedSectionText, readTemplate } = require("../utilities.cjs");

/**
 * Generates a simple Markdown heading with the contents of the specified template file and (optionally) a heading.
 *
 * @param {string} templateFileName - The name of the template file to be embedded.
 * @param {object} options - Content generation options.
 * @param {number} options.headingLevel - Root heading level for the generated section.
 * Must be a positive integer.
 * @param {string} options.headingText - Text to use for the heading, if one is to be generated.
 * A heading will only be included if this is specified.
 */
const generateSectionFromTemplate = (templateFileName, options) => {
	const sectionBody = readTemplate(templateFileName, options.headingLevel);
	return formattedSectionText(sectionBody, options);
};

module.exports = {
	generateSectionFromTemplate,
};
