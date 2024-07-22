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

const { generateSectionFromTemplate } = require("./generateSectionFromTemplate.cjs");

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

module.exports = {
	apiDocsLinkSectionTransform,
	exampleGettingStartedSectionTransform,
	generateApiDocsLinkSection,
	generateExampleGettingStartedSection,
	generateInstallationInstructionsSection,
	generatePackageImportInstructionsSection,
	generatePackageScopeNotice,
	generatePackageScriptsSection,
	generateSectionFromTemplate,
	includeTransform,
	installationInstructionsTransform,
	packageImportInstructionsSectionTransform,
	packageScopeNoticeTransform,
	packageScriptsSectionTransform,
};
