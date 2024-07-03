/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

const { PackageName } = require("@rushstack/node-core-library");
const scripts = require("markdown-magic-package-scripts");

const {
	createSectionFromTemplate,
	formattedGeneratedContentBody,
	getPackageMetadata,
	resolveRelativePackageJsonPath,
} = require("./utilities.cjs");
const {
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
} = require("./transforms/index.cjs");

/**
 * Generates a simple Markdown heading and contents with guidelines for taking dependencies on Fluid libraries.
 *
 * @param {boolean} includeHeading - Whether or not to include the heading in the generated contents.
 */
const generateDependencyGuidelines = (includeHeading) =>
	createSectionFromTemplate(
		"Dependency-Guidelines-Template.md",
		includeHeading ? "Using Fluid Framework libraries" : undefined,
	);

/**
 * Generates a Markdown heading and contents with a section pointing developers to our contribution guidelines.
 *
 * @param {boolean} includeHeading - Whether or not to include the heading in the generated contents.
 */
const generateContributionGuidelinesSection = (includeHeading) =>
	createSectionFromTemplate(
		"Contribution-Guidelines-Template.md",
		includeHeading ? "Contribution Guidelines" : undefined,
	);

/**
 * Generates a simple Markdown heading and contents with help information.
 *
 * @param {boolean} includeHeading - Whether or not to include the heading in the generated contents.
 */
const generateHelpSection = (includeHeading) =>
	createSectionFromTemplate("Help-Template.md", includeHeading ? "Help" : undefined);

/**
 * Generates a simple Markdown heading and contents with trademark information.
 *
 * @param {boolean} includeHeading - Whether or not to include the heading in the generated contents.
 */
const generateTrademarkSection = (includeHeading) =>
	createSectionFromTemplate("Trademark-Template.md", includeHeading ? "Trademark" : undefined);

/**
 * Gets the appropriate scope kind for the provided package name.
 *
 * @param {string} packageName
 * @returns {"EXPERIMENTAL" | "INTERNAL" | "PRIVATE" | undefined} A scope kind based on the package's scope (namespace).
 */
const getScopeKindFromPackage = (packageName) => {
	const packageScope = PackageName.getScope(packageName);
	if (packageScope === `@fluid-experimental`) {
		return "EXPERIMENTAL";
	} else if (packageScope === `@fluid-internal`) {
		return "INTERNAL";
	} else if (packageScope === `@fluid-private`) {
		return "PRIVATE";
	} else {
		return undefined;
	}
};

/**
 * Generates simple README contents for a library package.
 *
 * Includes:
 *
 * - Package scope notice (if applicable)
 *
 * - Installation instructions
 *
 * - Import instructions
 *
 * - Link to API documentation for the package on <fluidframework.com>
 *
 * - Package script documentation (only if specified)
 *
 * - Fluid Framework contribution guidelines
 *
 * - Help section
 *
 * - Microsoft trademark info
 *
 * @param {object} content - The original document file contents.
 * @param {object} options - Transform options.
 * @param {string | undefined} options.packageJsonPath - (optional) Relative path from the document to the package's package.json file.
 * Default: "./package.json".
 * @param {"EXPERIMENTAL" | "INTERNAL" | "PRIVATE" | undefined} options.packageScopeNotice - (optional) Kind of package scope (namespace) notice to add.
 * EXPERIMENTAL: See templates/Experimental-Package-Notice-Template.md.
 * INTERNAL: See templates/Internal-Package-Notice-Template.md.
 * PRIVATE: See templates/Private-Package-Notice-Template.md.
 * `undefined`: Inherit from package namespace (fluid-experimental, fluid-internal, fluid-private).
 * @param {"TRUE" | "FALSE" | undefined} options.installation - (optional) Whether or not to include the package installation instructions section.
 * Default: `TRUE`.
 * @param {"TRUE" | "FALSE" | undefined} options.devDependency - (optional) Whether or not the package is intended to be installed as a devDependency.
 * Only used if `installation` is specified.
 * Default: `FALSE`.
 * @param {"FALSE" | undefined} options.importInstructions - (optional) Whether or not to include information about how to import from the package's export options.
 * Default: Checks at the `package.json` file for an `exports` property.
 * Will include the section if the property is found, and one of our special paths is found (`/alpha`, `/beta`, or `/legacy`).
 * Can be explicitly disabled by specifying `FALSE`.
 * @param {"TRUE" | "FALSE" | undefined} options.apiDocs - (optional) Whether or not to include a section pointing readers to the package's generated API documentation on <fluidframework.com>.
 * Default: `TRUE`.
 * @param {"TRUE" | "FALSE" | undefined} options.scripts - (optional) Whether or not to include a section enumerating the package.json file's dev scripts.
 * Default: `FALSE`.
 * @param {"TRUE" | "FALSE" | undefined} options.contributionGuidelines - (optional) Whether or not to include a section outlining fluid-framework's contribution guidelines.
 * Default: `TRUE`.
 * @param {"TRUE" | "FALSE" | undefined} options.help - (optional) Whether or not to include a developer help section.
 * Default: `TRUE`.
 * @param {"TRUE" | "FALSE" | undefined} options.trademark - (optional) Whether or not to include a section with Microsoft's trademark info.
 * Default: `TRUE`.
 * @param {object} config - Transform configuration.
 * @param {string} config.originalPath - Path to the document being modified.
 */
function libraryPackageReadmeTransform(content, options, config) {
	const { packageJsonPath: relativePackageJsonPath } = options;
	const resolvedPackageJsonPath = resolveRelativePackageJsonPath(
		config.originalPath,
		relativePackageJsonPath,
	);
	const packageMetadata = getPackageMetadata(resolvedPackageJsonPath);
	const packageName = packageMetadata.name;

	const sections = [];

	// Note: if the user specified an explicit scope, that takes precedence over the package namespace.
	const scopeKind = options.packageScopeNotice ?? getScopeKindFromPackage(packageName);
	if (scopeKind !== undefined) {
		sections.push(generatePackageScopeNotice(scopeKind));
	}

	if (options.installation !== "FALSE") {
		sections.push(
			generateDependencyGuidelines(true),
			generateInstallationInstructionsSection(packageName, options.devDependency, true),
		);
	}

	if (options.importInstructions !== "FALSE") {
		sections.push(generatePackageImportInstructionsSection(packageMetadata, true));
	}

	if (options.apiDocs !== "FALSE") {
		sections.push(generateApiDocsLinkSection(packageName, true));
	}

	if (options.scripts === "TRUE") {
		options.pkg = relativePackageJsonPath;
		const scriptsTable = scripts(content, options, config);
		sections.push(generatePackageScriptsSection(scriptsTable, true));
	}

	if (options.contributionGuidelines !== "FALSE") {
		sections.push(generateContributionGuidelinesSection(true));
	}

	if (options.help !== "FALSE") {
		sections.push(generateHelpSection(true));
	}

	if (options.trademark !== "FALSE") {
		sections.push(generateTrademarkSection(true));
	}

	return formattedGeneratedContentBody(sections.join(""));
}

/**
 * Generates simple README contents for a example app package.
 *
 * @param {object} content - The original document file contents.
 * @param {object} options - Transform options.
 * @param {string | undefined} options.packageJsonPath - (optional) Relative path from the document to the package's package.json file.
 * Default: "./package.json".
 * @param {"TRUE" | "FALSE" | undefined} options.gettingStarted - (optional) Whether or not to include developer getting started instructions section.
 * Default: `TRUE`.
 * @param {"TRUE" | "FALSE" | undefined} options.usesTinylicious - (optional) Whether or not the example app workflow uses {@link https://github.com/microsoft/FluidFramework/tree/main/server/routerlicious/packages/tinylicious | Tinylicious}.
 * Only used if `gettingStarted` is specified.
 * Default: `TRUE`.
 * @param {"TRUE" | "FALSE" | undefined} options.scripts - (optional) Whether or not to include a section enumerating the package.json file's dev scripts.
 * Default: `FALSE`.
 * @param {"TRUE" | "FALSE" | undefined} options.contributionGuidelines - (optional) Whether or not to include a section outlining fluid-framework's contribution guidelines.
 * Default: `TRUE`.
 * @param {"TRUE" | "FALSE" | undefined} options.help - (optional) Whether or not to include a developer help section.
 * Default: `TRUE`.
 * @param {"TRUE" | "FALSE" | undefined} options.trademark - (optional) Whether or not to include a section with Microsoft's trademark info.
 * Default: `TRUE`.
 * @param {object} config - Transform configuration.
 * @param {string} config.originalPath - Path to the document being modified.
 */
function examplePackageReadmeTransform(content, options, config) {
	const { packageJsonPath: relativePackageJsonPath } = options;

	const resolvedPackageJsonPath = resolveRelativePackageJsonPath(
		config.originalPath,
		relativePackageJsonPath,
	);

	const sections = [];
	if (options.gettingStarted !== "FALSE") {
		sections.push(
			generateExampleGettingStartedSection(
				resolvedPackageJsonPath,
				/* includeTinyliciousStep: */ options.usesTinylicious !== "FALSE",
				/* includeHeading: */ true,
			),
		);
	}

	if (options.scripts === "TRUE") {
		options.pkg = relativePackageJsonPath;
		const scriptsTable = scripts(content, options, config);
		sections.push(generatePackageScriptsSection(scriptsTable, /* includeHeading: */ true));
	}

	if (options.contributionGuidelines !== "FALSE") {
		sections.push(generateContributionGuidelinesSection(/* includeHeading: */ true));
	}

	if (options.help !== "FALSE") {
		sections.push(generateHelpSection(/* includeHeading: */ true));
	}

	if (options.trademark !== "FALSE") {
		sections.push(generateTrademarkSection(/* includeHeading: */ true));
	}

	return formattedGeneratedContentBody(sections.join(""));
}

/**
 * Generates a README section with fluid-framework contribution guidelines.
 *
 * @param {string} templateFileName - The name of the template file to be embedded.
 * @param {string|undefined} maybeHeadingText - (optional) Text to use for the heading.
 * A heading will only be included if this is specified.
 */
function templateTransform(templateFileName, maybeHeadingText) {
	return formattedGeneratedContentBody(
		generateSectionFromTemplate(templateFileName, maybeHeadingText),
	);
}

/**
 * markdown-magic config
 */
module.exports = {
	transforms: {
		/**
		 * See {@link includeTransform}.
		 *
		 * @example
		 *
		 * ```markdown
		 * <!-- AUTO-GENERATED-CONTENT:START (INCLUDE:path=../file.js&start=1&end=-1) -->
		 * ```
		 */
		INCLUDE: includeTransform,

		/**
		 * See {@link libraryPackageReadmeTransform}.
		 *
		 * @example
		 *
		 * ```markdown
		 * <!-- AUTO-GENERATED-CONTENT:START (README_LIBRARY_PACKAGE:packageJsonPath=./package.json&installation=TRUE&devDependency=FALSE&apiDocs=TRUE&scripts=FALSE&       contributionGuidelines=TRUE&help=TRUE&trademark=TRUE) -->
		 * ```
		 */
		LIBRARY_PACKAGE_README: libraryPackageReadmeTransform,

		/**
		 * See {@link examplePackageReadmeTransform}.
		 *
		 * @example
		 *
		 * ```markdown
		 * <!-- AUTO-GENERATED-CONTENT:START (README_EXAMPLE_PACKAGE:packageJsonPath=./package.json&gettingStarted=TRUE&usesTinylicious=TRUE&scripts=FALSE&     contributionGuidelines=TRUE&help=TRUE&trademark=TRUE) -->
		 * <!-- AUTO-GENERATED-CONTENT:END -->
		 * ```
		 */
		EXAMPLE_PACKAGE_README: examplePackageReadmeTransform,

		/**
		 * See {@link exampleGettingStartedSectionTransform}.
		 *
		 * @example
		 *
		 * ```markdown
		 * <!-- AUTO-GENERATED-CONTENT:START (README_EXAMPLE_GETTING_STARTED_SECTION:packageJsonPath=./package.json&usesTinylicious=TRUE&includeHeading=TRUE) -->
		 * <!-- AUTO-GENERATED-CONTENT:END -->
		 * ```
		 */
		README_EXAMPLE_GETTING_STARTED_SECTION: exampleGettingStartedSectionTransform,

		/**
		 * See {@link packageScopeNoticeTransform}.
		 *
		 * @example
		 *
		 * ```markdown
		 * <!-- AUTO-GENERATED-CONTENT:START (README_PACKAGE_SCOPE_NOTICE:packageJsonPath=./package.json) -->
		 * <!-- AUTO-GENERATED-CONTENT:END -->
		 * ```
		 */
		README_PACKAGE_SCOPE_NOTICE: packageScopeNoticeTransform,

		/**
		 * See {@link readmeApiDocsSectionTransform}.
		 *
		 * @example
		 *
		 * ```markdown
		 * <!-- AUTO-GENERATED-CONTENT:START (README_API_DOCS_SECTION:packageJsonPath=./package.json&includeHeading=TRUE) -->
		 * <!-- AUTO-GENERATED-CONTENT:END -->
		 * ```
		 */
		API_DOCS_LINK_SECTION: apiDocsLinkSectionTransform,

		/**
		 * See {@link installationInstructionsTransform}.
		 *
		 * @example
		 *
		 * ```markdown
		 * <!-- AUTO-GENERATED-CONTENT:START (README_INSTALLATION_SECTION:packageJsonPath=./package.json&includeHeading=TRUE&devDependency=FALSE) -->
		 * <!-- AUTO-GENERATED-CONTENT:END -->
		 * ```
		 */
		README_INSTALLATION_SECTION: installationInstructionsTransform,

		/**
		 * See {@link packageImportInstructionsSectionTransform}.
		 *
		 * @example
		 *
		 * ```markdown
		 * <!-- AUTO-GENERATED-CONTENT:START (README_IMPORT_INSTRUCTIONS:packageJsonPath=./package.json&includeHeading=TRUE) -->
		 * <!-- AUTO-GENERATED-CONTENT:END -->
		 * ```
		 */
		README_IMPORT_INSTRUCTIONS: packageImportInstructionsSectionTransform,

		/**
		 * Generates a README section with Microsoft trademark info.
		 *
		 * @param {object} content - The original document file contents.
		 * @param {object} options - Transform options.
		 * @param {"TRUE" | "FALSE" | undefined} options.includeHeading - (optional) Whether or not to include a Markdown heading with the generated section contents.
		 * Default: `TRUE`.
		 * @param {object} config - Transform configuration.
		 * @param {string} config.originalPath - Path to the document being modified.
		 *
		 * @example
		 *
		 * ```markdown
		 * <!-- AUTO-GENERATED-CONTENT:START (README_TRADEMARK_SECTION:includeHeading=TRUE) -->
		 * <!-- AUTO-GENERATED-CONTENT:END -->
		 * ```
		 */
		README_TRADEMARK_SECTION: (content, options, config) =>
			templateTransform(
				"Trademark-Template.md",
				options.includeHeading !== "FALSE" ? "Trademark" : undefined,
			),

		/**
		 * Generates a README section with fluid-framework contribution guidelines.
		 *
		 * @param {object} content - The original document file contents.
		 * @param {object} options - Transform options.
		 * @param {"TRUE" | "FALSE" | undefined} options.includeHeading - (optional) Whether or not to include a Markdown heading with the generated section contents.
		 * Default: `TRUE`.
		 * @param {object} config - Transform configuration.
		 * @param {string} config.originalPath - Path to the document being modified.
		 *
		 * @example
		 *
		 * ```markdown
		 * <!-- AUTO-GENERATED-CONTENT:START (README_CONTRIBUTION_GUIDELINES_SECTION:includeHeading=TRUE) -->
		 * <!-- AUTO-GENERATED-CONTENT:END -->
		 * ```
		 */
		README_CONTRIBUTION_GUIDELINES_SECTION: (content, options, config) =>
			templateTransform(
				"Contribution-Guidelines-Template.md",
				options.includeHeading !== "FALSE" ? "Contribution Guidelines" : undefined,
			),

		/**
		 * Generates a README section with fluid-framework dependency guidelines.
		 *
		 * @param {object} content - The original document file contents.
		 * @param {object} options - Transform options.
		 * @param {"TRUE" | "FALSE" | undefined} options.includeHeading - (optional) Whether or not to include a Markdown heading with the generated section contents.
		 * Default: `TRUE`.
		 * @param {object} config - Transform configuration.
		 * @param {string} config.originalPath - Path to the document being modified.
		 *
		 * @example
		 *
		 * ```markdown
		 * <!-- AUTO-GENERATED-CONTENT:START (README_DEPENDENCY_GUIDELINES_SECTION:includeHeading=TRUE) -->
		 * <!-- AUTO-GENERATED-CONTENT:END -->
		 * ```
		 */
		README_DEPENDENCY_GUIDELINES_SECTION: (content, options, config) =>
			templateTransform(
				"Dependency-Guidelines-Template.md",
				options.includeHeading !== "FALSE" ? "Dependency Guidelines" : undefined,
			),

		/**
		 * Generates a README "Help" section.
		 *
		 * @param {object} content - The original document file contents.
		 * @param {object} options - Transform options.
		 * @param {"TRUE" | "FALSE" | undefined} options.includeHeading - (optional) Whether or not to include a Markdown heading with the generated section contents.
		 * Default: `TRUE`.
		 * @param {object} config - Transform configuration.
		 * @param {string} config.originalPath - Path to the document being modified.
		 *
		 * @example
		 *
		 * ```markdown
		 * <!-- AUTO-GENERATED-CONTENT:START (README_HELP_SECTION:includeHeading=TRUE) -->
		 * <!-- AUTO-GENERATED-CONTENT:END -->
		 * ```
		 */
		README_HELP_SECTION: (content, options, config) =>
			templateTransform(
				"Help-Template.md",
				options.includeHeading !== "FALSE" ? "Help" : undefined,
			),

		/**
		 * See {@link packageScriptsSectionTransform}.
		 *
		 * @example
		 *
		 * ```markdown
		 * <!-- AUTO-GENERATED-CONTENT:START (PACKAGE_JSON_SCRIPTS:includeHeading=TRUE) -->
		 * <!-- AUTO-GENERATED-CONTENT:END -->
		 * ```
		 */
		README_PACKAGE_SCRIPTS: packageScriptsSectionTransform,
	},
	globbyOptions: {
		gitignore: true,
		onlyFiles: true,
		deep: 5,
	},
};
