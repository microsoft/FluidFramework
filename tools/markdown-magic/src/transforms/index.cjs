/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

const {
	apiDocsTransform,
	generateApiDocsSection,
} = require("./apiDocsLinkSectionTransform.cjs");

const {
	generateExampleGettingStartedSection,
	exampleGettingStartedTransform,
} = require("./exampleGettingStartedTransform.cjs");

const { generateSectionFromTemplate } = require("./generateSectionFromTemplate.cjs");

const { includeTransform } = require("./includeTransform.cjs");

const { includeCodeTransform } = require("./includeCodeTransform.cjs");

const {
	generateInstallationInstructionsSection,
	installationInstructionsTransform,
} = require("./installationInstructionsTransform.cjs");

const {
	generateImportInstructionsSection,
	importInstructionsTransform,
} = require("./packageImportInstructionsTransform.cjs");

const {
	generatePackageScopeNotice,
	packageScopeNoticeTransform,
} = require("./packageScopeNoticeTransform.cjs");

const {
	generatePackageScriptsSection,
	packageScriptsTransform,
} = require("./packageScriptsTransform.cjs");

module.exports = {
	apiDocsTransform,
	exampleGettingStartedTransform,
	generateApiDocsSection,
	generateExampleGettingStartedSection,
	generateInstallationInstructionsSection,
	generateImportInstructionsSection,
	generatePackageScopeNotice,
	generatePackageScriptsSection,
	generateSectionFromTemplate,
	includeTransform,
	includeCodeTransform,
	installationInstructionsTransform,
	importInstructionsTransform,
	packageScopeNoticeTransform,
	packageScriptsTransform,
};
