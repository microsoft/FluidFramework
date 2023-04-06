/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

const {
	apiDocsLinkSectionTransform,
	generateApiDocsLinkSection,
} = require("./apiDocsLinkSectionTransform.cjs");

const {
	generatePackageScriptsSection,
	packageScriptsSectionTransform,
} = require("./packageScriptsTransform.cjs");

module.exports = {
	apiDocsLinkSectionTransform,
	generateApiDocsLinkSection,
	generatePackageScriptsSection,
	packageScriptsSectionTransform,
};
