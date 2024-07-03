/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

const {
	apiDocsLinkSectionTransform,
	generateApiDocsLinkSection,
} = require("./apiDocsLinkSectionTransform.cjs");

const {
	generateExampleGettingStartedSection,
	exampleGettingStartedSectionTransform,
} = require("./exampleGettingStartedTransform.cjs");

const { generateHelpSection, helpSectionTransform } = require("./helpSectionTransform.cjs");

const { includeTransform } = require("./includeTransform.cjs");

const {
	generateInstallationInstructionsSection,
	installationInstructionsTransform,
} = require("./installationInstructionsTransform.cjs");

const {
	generatePackageImportInstructionsSection,
	packageImportInstructionsSectionTransform,
} = require("./packageImportInstructionsTransform.cjs");

const {
	generatePackageScopeNotice,
	packageScopeNoticeTransform,
} = require("./packageScopeNoticeTransform.cjs");

const {
	generatePackageScriptsSection,
	packageScriptsSectionTransform,
} = require("./packageScriptsTransform.cjs");

const {
	generateTrademarkSection,
	trademarkSectionTransform,
} = require("./trademarkSectionTransform.cjs");

module.exports = {
	apiDocsLinkSectionTransform,
	exampleGettingStartedSectionTransform,
	generateApiDocsLinkSection,
	generateExampleGettingStartedSection,
	generateHelpSection,
	generateInstallationInstructionsSection,
	generatePackageImportInstructionsSection,
	generatePackageScopeNotice,
	generatePackageScriptsSection,
	generateTrademarkSection,
	helpSectionTransform,
	includeTransform,
	installationInstructionsTransform,
	packageImportInstructionsSectionTransform,
	packageScopeNoticeTransform,
	packageScriptsSectionTransform,
	trademarkSectionTransform,
};
