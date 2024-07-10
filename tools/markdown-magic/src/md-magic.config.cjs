/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

const scripts = require("markdown-magic-package-scripts");

const { defaultSectionHeadingLevel } = require("./constants.cjs");
const {
	formattedGeneratedContentBody,
	getPackageMetadata,
	getScopeKindFromPackage,
	parseHeadingOptions,
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
 * @param {object} headingOptions - Heading generation options.
 * @param {boolean} includeHeading - Whether or not to include a heading in the generated content.
 * If not specified, no top-level heading will be included in the section.
 * @param {number} headingOptions.headingLevel - Root heading level for the generated section.
 * Must be a positive integer.
 */
const generateDependencyGuidelines = (headingOptions) =>
	generateSectionFromTemplate("Dependency-Guidelines-Template.md", {
		...headingOptions,
		headingText: "Using Fluid Framework libraries",
	});

/**
 * Generates a Markdown section listing Fluid Framework's minimum client requirements.
 *
 * @param {object} headingOptions - Heading generation options.
 * @param {boolean} includeHeading - Whether or not to include a heading in the generated content.
 * If not specified, no top-level heading will be included in the section.
 * @param {number} headingOptions.headingLevel - Root heading level for the generated section.
 * Must be a positive integer.
 */
const generateClientRequirementsSection = (headingOptions) =>
	generateSectionFromTemplate("Client-Requirements-Template.md", {
		...headingOptions,
		headingText: "Minimum Client Requirements",
	});

/**
 * Generates a Markdown heading and contents with a section pointing developers to our contribution guidelines.
 *
 * @param {object} headingOptions - Heading generation options.
 * @param {boolean} includeHeading - Whether or not to include a heading in the generated content.
 * If not specified, no top-level heading will be included in the section.
 * @param {number} headingOptions.headingLevel - Root heading level for the generated section.
 * Must be a positive integer.
 */
const generateContributionGuidelinesSection = (headingOptions) =>
	generateSectionFromTemplate("Contribution-Guidelines-Template.md", {
		...headingOptions,
		headingText: "Contribution Guidelines",
	});

/**
 * Generates a simple Markdown heading and contents with help information.
 *
 * @param {object} headingOptions - Heading generation options.
 * @param {boolean} includeHeading - Whether or not to include a heading in the generated content.
 * If not specified, no top-level heading will be included in the section.
 * @param {number} headingOptions.headingLevel - Root heading level for the generated section.
 * Must be a positive integer.
 */
const generateHelpSection = (headingOptions) =>
	generateSectionFromTemplate("Help-Template.md", {
		...headingOptions,
		headingText: "Help",
	});

/**
 * Generates a simple Markdown heading and contents with trademark information.
 *
 * @param {object} headingOptions - Heading generation options.
 * @param {boolean} includeHeading - Whether or not to include a heading in the generated content.
 * If not specified, no top-level heading will be included in the section.
 * @param {number} headingOptions.headingLevel - Root heading level for the generated section.
 * Must be a positive integer.
 */
const generateTrademarkSection = (headingOptions) =>
	generateSectionFromTemplate("Trademark-Template.md", {
		...headingOptions,
		headingText: "Trademark",
	});

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
 * @param {"TRUE" | "FALSE" | undefined} options.clientRequirements - (optional) Whether or not to include a section listing Fluid Framework's minimum client requirements.
 * Default: `TRUE`.
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

	const sectionHeadingOptions = {
		includeHeading: true,
		headingLevel: defaultSectionHeadingLevel,
	};

	const sections = [];

	// Note: if the user specified an explicit scope, that takes precedence over the package namespace.
	const scopeKind = options.packageScopeNotice ?? getScopeKindFromPackage(packageName);
	if (scopeKind !== undefined) {
		sections.push(generatePackageScopeNotice(scopeKind));
	}

	if (options.installation !== "FALSE") {
		sections.push(
			generateDependencyGuidelines(sectionHeadingOptions),
			generateInstallationInstructionsSection(
				packageName,
				options.devDependency,
				sectionHeadingOptions,
			),
		);
	}

	if (options.importInstructions !== "FALSE") {
		sections.push(
			generatePackageImportInstructionsSection(packageMetadata, sectionHeadingOptions),
		);
	}

	if (options.apiDocs !== "FALSE") {
		sections.push(generateApiDocsLinkSection(packageName, sectionHeadingOptions));
	}

	if (options.scripts === "TRUE") {
		options.pkg = relativePackageJsonPath;
		const scriptsTable = scripts(content, options, config);
		sections.push(generatePackageScriptsSection(scriptsTable, sectionHeadingOptions));
	}

	if (options.contributionGuidelines !== "FALSE") {
		sections.push(generateClientRequirementsSection(sectionHeadingOptions));
	}

	if (options.contributionGuidelines !== "FALSE") {
		sections.push(generateContributionGuidelinesSection(sectionHeadingOptions));
	}

	if (options.help !== "FALSE") {
		sections.push(generateHelpSection(sectionHeadingOptions));
	}

	if (options.trademark !== "FALSE") {
		sections.push(generateTrademarkSection(sectionHeadingOptions));
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

	const sectionHeadingOptions = {
		includeHeading: true,
		headingLevel: defaultSectionHeadingLevel,
	};

	const sections = [];
	if (options.gettingStarted !== "FALSE") {
		sections.push(
			generateExampleGettingStartedSection(
				resolvedPackageJsonPath,
				/* includeTinyliciousStep: */ options.usesTinylicious !== "FALSE",
				/* headingOptions: */ sectionHeadingOptions,
			),
		);
	}

	if (options.scripts === "TRUE") {
		options.pkg = relativePackageJsonPath;
		const scriptsTable = scripts(content, options, config);
		sections.push(
			generatePackageScriptsSection(
				scriptsTable,
				/* headingOptions: */ sectionHeadingOptions,
			),
		);
	}

	if (options.contributionGuidelines !== "FALSE") {
		sections.push(
			generateContributionGuidelinesSection(/* headingOptions: */ sectionHeadingOptions),
		);
	}

	if (options.help !== "FALSE") {
		sections.push(generateHelpSection(/* headingOptions: */ sectionHeadingOptions));
	}

	if (options.trademark !== "FALSE") {
		sections.push(generateTrademarkSection(/* headingOptions: */ sectionHeadingOptions));
	}

	return formattedGeneratedContentBody(sections.join(""));
}

/**
 * Generates a README section with fluid-framework contribution guidelines.
 *
 * @param {string} templateFileName - The name of the template file to be embedded.
 * @param {object} headingOptions - Heading generation options.
 * @param {boolean} headingOptions.includeHeading - Whether or not to include a top-level heading in the generated section.
 * @param {number} headingOptions.headingLevel - Root heading level for the generated section.
 * Must be a positive integer.
 * @param {string} headingOptions.headingText - Text to display in the section heading, if one was requested.
 */
function templateTransform(templateFileName, headingOptions) {
	return formattedGeneratedContentBody(
		generateSectionFromTemplate(templateFileName, headingOptions),
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
		 * <!-- AUTO-GENERATED-CONTENT:START (README_LIBRARY_PACKAGE:packageJsonPath=./package.json&installation=TRUE&devDependency=FALSE&apiDocs=TRUE&scripts=FALSE&contributionGuidelines=TRUE&help=TRUE&trademark=TRUE) -->
		 * ```
		 */
		LIBRARY_PACKAGE_README: libraryPackageReadmeTransform,

		/**
		 * See {@link examplePackageReadmeTransform}.
		 *
		 * @example
		 *
		 * ```markdown
		 * <!-- AUTO-GENERATED-CONTENT:START (README_EXAMPLE_PACKAGE:packageJsonPath=./package.json&gettingStarted=TRUE&usesTinylicious=TRUE&scripts=FALSE&contributionGuidelines=TRUE&help=TRUE&trademark=TRUE) -->
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
		 * <!-- AUTO-GENERATED-CONTENT:START (README_EXAMPLE_GETTING_STARTED_SECTION:packageJsonPath=./package.json&usesTinylicious=TRUE&includeHeading=TRUE&headingLevel=2) -->
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
		 * <!-- AUTO-GENERATED-CONTENT:START (README_API_DOCS_SECTION:packageJsonPath=./package.json&includeHeading=TRUE&headingLevel=2) -->
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
		 * <!-- AUTO-GENERATED-CONTENT:START (README_INSTALLATION_SECTION:packageJsonPath=./package.json&includeHeading=TRUE&headingLevel=2&devDependency=FALSE) -->
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
		 * <!-- AUTO-GENERATED-CONTENT:START (README_IMPORT_INSTRUCTIONS:packageJsonPath=./package.json&includeHeading=TRUE&headingLevel=2) -->
		 * <!-- AUTO-GENERATED-CONTENT:END -->
		 * ```
		 */
		README_IMPORT_INSTRUCTIONS: packageImportInstructionsSectionTransform,

		/**
		 * Generates a README section with Fluid Framework client requirements.
		 *
		 * @param {object} content - The original document file contents.
		 * @param {object} options - Transform options.
		 * @param {"TRUE" | "FALSE" | undefined} includeHeading - (optional) Whether or not to include a top-level heading in the generated section.
		 * default: `TRUE`.
		 * @param {number | undefined} options.headingLevel - (optional) Heading level for the section.
		 * Must be a positive integer.
		 * Default: {@link defaultSectionHeadingLevel}.
		 * @param {object} config - Transform configuration.
		 * @param {string} config.originalPath - Path to the document being modified.
		 *
		 * @example
		 *
		 * ```markdown
		 * <!-- AUTO-GENERATED-CONTENT:START (README_CLIENT_REQUIREMENTS_SECTION:headingLevel=2) -->
		 * <!-- AUTO-GENERATED-CONTENT:END -->
		 * ```
		 */
		README_CLIENT_REQUIREMENTS_SECTION: (content, options, config) => {
			return templateTransform(
				"Client-Requirements-Template.md",
				parseHeadingOptions(options, "Client Requirements"),
			);
		},

		/**
		 * Generates a README section with Microsoft trademark info.
		 *
		 * @param {object} content - The original document file contents.
		 * @param {object} options - Transform options.
		 * @param {"TRUE" | "FALSE" | undefined} includeHeading - (optional) Whether or not to include a top-level heading in the generated section.
		 * default: `TRUE`.
		 * @param {number | undefined} options.headingLevel - (optional) Heading level for the section.
		 * Must be a positive integer.
		 * Default: {@link defaultSectionHeadingLevel}.
		 * @param {object} config - Transform configuration.
		 * @param {string} config.originalPath - Path to the document being modified.
		 *
		 * @example
		 *
		 * ```markdown
		 * <!-- AUTO-GENERATED-CONTENT:START (README_TRADEMARK_SECTION:includeHeading=TRUE&includeHeading=TRUE&headingLevel=2) -->
		 * <!-- AUTO-GENERATED-CONTENT:END -->
		 * ```
		 */
		README_TRADEMARK_SECTION: (content, options, config) =>
			templateTransform("Trademark-Template.md", parseHeadingOptions(options, "Trademark")),

		/**
		 * Generates a README section with fluid-framework contribution guidelines.
		 *
		 * @param {object} content - The original document file contents.
		 * @param {object} options - Transform options.
		 * @param {"TRUE" | "FALSE" | undefined} includeHeading - (optional) Whether or not to include a top-level heading in the generated section.
		 * default: `TRUE`.
		 * @param {number | undefined} options.headingLevel - (optional) Heading level for the section.
		 * Must be a positive integer.
		 * Default: {@link defaultSectionHeadingLevel}.
		 * @param {object} config - Transform configuration.
		 * @param {string} config.originalPath - Path to the document being modified.
		 *
		 * @example
		 *
		 * ```markdown
		 * <!-- AUTO-GENERATED-CONTENT:START (README_CONTRIBUTION_GUIDELINES_SECTION:includeHeading=TRUE&includeHeading=TRUE&headingLevel=2) -->
		 * <!-- AUTO-GENERATED-CONTENT:END -->
		 * ```
		 */
		README_CONTRIBUTION_GUIDELINES_SECTION: (content, options, config) =>
			templateTransform(
				"Contribution-Guidelines-Template.md",
				parseHeadingOptions(options, "Contribution Guidelines"),
			),

		/**
		 * Generates a README section with fluid-framework dependency guidelines.
		 *
		 * @param {object} content - The original document file contents.
		 * @param {object} options - Transform options.
		 * @param {"TRUE" | "FALSE" | undefined} includeHeading - (optional) Whether or not to include a top-level heading in the generated section.
		 * default: `TRUE`.
		 * @param {number | undefined} options.headingLevel - (optional) Heading level for the section.
		 * Must be a positive integer.
		 * Default: {@link defaultSectionHeadingLevel}.
		 * @param {object} config - Transform configuration.
		 * @param {string} config.originalPath - Path to the document being modified.
		 *
		 * @example
		 *
		 * ```markdown
		 * <!-- AUTO-GENERATED-CONTENT:START (README_DEPENDENCY_GUIDELINES_SECTION:includeHeading=TRUE&includeHeading=TRUE&headingLevel=2) -->
		 * <!-- AUTO-GENERATED-CONTENT:END -->
		 * ```
		 */
		README_DEPENDENCY_GUIDELINES_SECTION: (content, options, config) =>
			templateTransform(
				"Dependency-Guidelines-Template.md",
				parseHeadingOptions(options, "Using Fluid Framework libraries"),
			),

		/**
		 * Generates a README "Help" section.
		 *
		 * @param {object} content - The original document file contents.
		 * @param {object} options - Transform options.
		 * @param {"TRUE" | "FALSE" | undefined} includeHeading - (optional) Whether or not to include a top-level heading in the generated section.
		 * default: `TRUE`.
		 * @param {number | undefined} options.headingLevel - (optional) Heading level for the section.
		 * Must be a positive integer.
		 * Default: {@link defaultSectionHeadingLevel}.
		 * @param {object} config - Transform configuration.
		 * @param {string} config.originalPath - Path to the document being modified.
		 *
		 * @example
		 *
		 * ```markdown
		 * <!-- AUTO-GENERATED-CONTENT:START (README_HELP_SECTION:includeHeading=TRUE&includeHeading=TRUE&headingLevel=2) -->
		 * <!-- AUTO-GENERATED-CONTENT:END -->
		 * ```
		 */
		README_HELP_SECTION: (content, options, config) =>
			templateTransform("Help-Template.md", parseHeadingOptions(options, "Help")),

		/**
		 * See {@link packageScriptsSectionTransform}.
		 *
		 * @example
		 *
		 * ```markdown
		 * <!-- AUTO-GENERATED-CONTENT:START (PACKAGE_JSON_SCRIPTS:includeHeading=TRUE&headingLevel=2) -->
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
