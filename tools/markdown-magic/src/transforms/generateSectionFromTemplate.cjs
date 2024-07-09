/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

const { formattedSectionText, readTemplate } = require("../utilities.cjs");

/**
 * Generates a simple Markdown heading with the contents of the specified template file and (optionally) a heading.
 *
 * @param {string} templateFileName - The name of the template file to be embedded.
 * @param {string|undefined} maybeHeadingText - (optional) Text to use for the heading.
 * A heading will only be included if this is specified.
 */
const generateSectionFromTemplate = (templateFileName, maybeHeadingText) => {
	const sectionBody = readTemplate(templateFileName);
	return formattedSectionText(sectionBody, maybeHeadingText);
};

module.exports = {
	generateSectionFromTemplate,
};
