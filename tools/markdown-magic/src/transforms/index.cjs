/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

const {
	apiDocsLinkSectionTransform,
	generateApiDocsLinkSection,
} = require("./apiDocsLinkSectionTransform.cjs");

const {
	generatePackageImportInstructionsSection,
	packageImportInstructionsSectionTransform,
} = require("./packageImportInstructionsTransform.cjs");

const {
	generatePackageScriptsSection,
	packageScriptsSectionTransform,
} = require("./packageScriptsTransform.cjs");

module.exports = {
	apiDocsLinkSectionTransform,
	generateApiDocsLinkSection,
	generatePackageImportInstructionsSection,
	generatePackageScriptsSection,
	packageImportInstructionsSectionTransform,
	packageScriptsSectionTransform,
};
