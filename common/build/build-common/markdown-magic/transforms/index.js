/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

const {
	apiDocsLinkSectionTransform,
	generateApiDocsLinkSection,
} = require("./apiDocsLinkSectionTransform");

const {
	generatePackageScriptsSection,
	packageScriptsSectionTransform,
} = require("./packageScriptsTransform");

module.exports = {
	apiDocsLinkSectionTransform,
	generateApiDocsLinkSection,
	generatePackageScriptsSection,
	packageScriptsSectionTransform,
};
