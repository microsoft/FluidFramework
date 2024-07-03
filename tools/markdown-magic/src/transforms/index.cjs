/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

const {
	apiDocsLinkSectionTransform,
	generateApiDocsLinkSection,
} = require("./apiDocsLinkSectionTransform.cjs");

const {includeTransform} = require("./includeTransform.cjs");

const {
	generateInstallationInstructionsSection,
	installationInstructionsTransform,
} = require("./installationInstructionsTransform.cjs");

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
	generateInstallationInstructionsSection,
	generatePackageImportInstructionsSection,
	generatePackageScriptsSection,
	includeTransform,
	installationInstructionsTransform,
	packageImportInstructionsSectionTransform,
	packageScriptsSectionTransform,
};
