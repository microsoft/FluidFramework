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
	isPublic,
	parseBooleanOption,
	parseHeadingOptions,
	resolveRelativePackageJsonPath,
} = require("./utilities.cjs");
const {
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
 * Generates simple "footer" contents for a library package README.
 *
 * @remarks Generally recommended for inclusion at the end of the README.
 *
 * Includes:
 *
 * - (if explicitly specified) Package script documentation
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
 * Default: Checks at the `package.json` file for an `exports` property.
 * Will include the section if the property is found, and one of our special paths is found (`/alpha`, `/beta`, or `/legacy`).
 * Can be explicitly disabled by specifying `FALSE`.
 * @param {"TRUE" | "FALSE" | undefined} options.scripts - (optional) Whether or not to include a section enumerating the package.json file's dev scripts.
 * Default: `FALSE`.
 * @param {"TRUE" | "FALSE" | undefined} options.clientRequirements - (optional) Whether or not to include a section listing Fluid Framework's minimum client requirements.
 * Default: `TRUE` if the package is end-user facing (i.e., a member of the `@fluidframework` or `@fluid-experimental` namespaces, or "fluid-framework"). `FALSE` otherwise.
 * @param {"TRUE" | "FALSE" | undefined} options.contributionGuidelines - (optional) Whether or not to include a section outlining fluid-framework's contribution guidelines.
 * Default: `TRUE`.
 * @param {"TRUE" | "FALSE" | undefined} options.help - (optional) Whether or not to include a developer help section.
 * Default: `TRUE`.
 * @param {"TRUE" | "FALSE" | undefined} options.trademark - (optional) Whether or not to include a section with Microsoft's trademark info.
 * Default: `TRUE`.
 * @param {object} config - Transform configuration.
 * @param {string} config.originalPath - Path to the document being modified.
 */
function readmeFooterTransform(content, options, config) {
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

	if (options.scripts === "TRUE") {
		options.pkg = relativePackageJsonPath;
		const scriptsTable = scripts(content, options, config);
		sections.push(generatePackageScriptsSection(scriptsTable, sectionHeadingOptions));
	}

	const includeClientRequirementsSection = parseBooleanOption(options.clientRequirements, () =>
		isPublic(packageMetadata),
	);
	if (includeClientRequirementsSection) {
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
 * Generates simple "header" contents for a library package README.
 * Contains instructions for installing the package and importing its contents.
 *
 * @remarks Generally recommended for inclusion after a brief package introduction, but before more detailed sections.
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
 * @param {object} content - The original document file contents.
 * @param {object} options - Transform options.
 * @param {string | undefined} options.packageJsonPath - (optional) Relative path from the document to the package's package.json file.
 * Default: "./package.json".
 * @param {"EXAMPLE" | "EXPERIMENTAL" | "INTERNAL" | "PRIVATE" | "TOOLS" | undefined} options.packageScopeNotice - (optional) Kind of package scope (namespace) notice to add.
 * EXAMPLE: See templates/Example-Package-Notice-Template.md.
 * EXPERIMENTAL: See templates/Experimental-Package-Notice-Template.md.
 * INTERNAL: See templates/Internal-Package-Notice-Template.md.
 * PRIVATE: See templates/Private-Package-Notice-Template.md.
 * TOOLS: See templates/Tools-Package-Notice-Template.md.
 * `undefined`: Inherit from package namespace (`fluid-experimental`, `fluid-internal`, `fluid-private`, `fluid-tools`, etc.).
 * @param {"TRUE" | "FALSE" | undefined} options.dependencyGuidelines - (optional) Whether or not to include the Fluid Framework dependency guidelines section.
 * Default: `TRUE` if the package is end-user facing (i.e., a member of the `@fluidframework` or `@fluid-experimental` namespaces, or "fluid-framework").
 * `FALSE` otherwise.
 * @param {"TRUE" | "FALSE" | undefined} options.installation - (optional) Whether or not to include the package installation instructions section.
 * Default: `TRUE` if the package is end-user facing (i.e., a member of the `@fluidframework` or `@fluid-experimental` namespaces, or "fluid-framework").
 * `FALSE` otherwise.
 * @param {"TRUE" | "FALSE" | undefined} options.devDependency - (optional) Whether or not the package is intended to be installed as a devDependency.
 * Only used if `installation` is specified.
 * Default: `FALSE`.
 * @param {"FALSE" | undefined} options.importInstructions - (optional) Whether or not to include information about how to import from the package's export options.
 * Default: Checks at the `package.json` file for an `exports` property.
 * Will include the section if the property is found, and one of our special paths is found (`/alpha`, `/beta`, or `/legacy`).
 * Can be explicitly disabled by specifying `FALSE`.
 * @param {"TRUE" | "FALSE" | undefined} options.apiDocs - (optional) Whether or not to include a section pointing readers to the package's generated API documentation on <fluidframework.com>.
 * Default: `TRUE` if the package is end-user facing (i.e., a member of the `@fluidframework` or `@fluid-experimental` namespaces, or "fluid-framework").
 * `FALSE` otherwise.
 * @param {object} config - Transform configuration.
 * @param {string} config.originalPath - Path to the document being modified.
 */
function libraryReadmeHeaderTransform(content, options, config) {
	const { packageJsonPath: relativePackageJsonPath } = options;
	const resolvedPackageJsonPath = resolveRelativePackageJsonPath(
		config.originalPath,
		relativePackageJsonPath,
	);
	const packageMetadata = getPackageMetadata(resolvedPackageJsonPath);
	const packageName = packageMetadata.name;
	const isPackagePublic = isPublic(packageMetadata);

	const sectionHeadingOptions = {
		includeHeading: true,
		headingLevel: defaultSectionHeadingLevel,
	};

	const sections = [];

	// Note: if the user specified an explicit scope, that takes precedence over the package namespace.
	const scopeKind = options.packageScopeNotice ?? getScopeKindFromPackage(packageName);
	const scopeNoticeSection = generatePackageScopeNotice(scopeKind);
	if (scopeNoticeSection !== undefined) {
		sections.push(scopeNoticeSection);
	}

	const includeDependencyGuidelinesSection = parseBooleanOption(
		options.dependencyGuidelines,
		isPackagePublic,
	);
	if (includeDependencyGuidelinesSection) {
		sections.push(generateDependencyGuidelines(sectionHeadingOptions));
	}

	const includeInstallationSection = parseBooleanOption(options.installation, isPackagePublic);
	if (includeInstallationSection) {
		sections.push(
			generateInstallationInstructionsSection(
				packageName,
				options.devDependency,
				sectionHeadingOptions,
			),
		);
	}

	const includeImportInstructionsSection = parseBooleanOption(
		options.importInstructions,
		true,
	);
	if (includeImportInstructionsSection) {
		sections.push(generateImportInstructionsSection(packageMetadata, sectionHeadingOptions));
	}

	const includeApiDocsSection = parseBooleanOption(options.apiDocs, isPackagePublic);
	if (includeApiDocsSection) {
		sections.push(generateApiDocsSection(packageName, sectionHeadingOptions));
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
 * @param {object} config - Transform configuration.
 * @param {string} config.originalPath - Path to the document being modified.
 */
function exampleAppReadmeHeaderTransform(content, options, config) {
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
		 * See {@link includeCodeTransform}.
		 *
		 * @example
		 *
		 * ```markdown
		 * <!-- AUTO-GENERATED-CONTENT:START (INCLUDE_CODE:path=../file.js&start=1&end=-1&language=typescript) -->
		 * ```
		 */
		INCLUDE_CODE: includeCodeTransform,

		/**
		 * See {@link libraryReadmeHeaderTransform}.
		 *
		 * @example
		 *
		 * ```markdown
		 * <!-- AUTO-GENERATED-CONTENT:START (LIBRARY_README_HEADER:packageJsonPath=./package.json&installation=TRUE&devDependency=FALSE&apiDocs=TRUE) -->
		 * ```
		 */
		LIBRARY_README_HEADER: libraryReadmeHeaderTransform,

		/**
		 * See {@link exampleAppReadmeHeaderTransform}.
		 *
		 * @example
		 *
		 * ```markdown
		 * <!-- AUTO-GENERATED-CONTENT:START (EXAMPLE_APP_README_HEADER:packageJsonPath=./package.json&gettingStarted=TRUE&usesTinylicious=TRUE&scripts=FALSE&contributionGuidelines=TRUE&help=TRUE&trademark=TRUE) -->
		 * <!-- AUTO-GENERATED-CONTENT:END -->
		 * ```
		 */
		EXAMPLE_APP_README_HEADER: exampleAppReadmeHeaderTransform,

		/**
		 * See {@link readmeFooterTransform}.
		 *
		 * @example
		 *
		 * ```markdown
		 * <!-- AUTO-GENERATED-CONTENT:START (README_FOOTER:packageJsonPath=./package.json&scripts=FALSE&contributionGuidelines=TRUE&help=TRUE&trademark=TRUE) -->
		 * ```
		 */
		README_FOOTER: readmeFooterTransform,

		/**
		 * See {@link exampleGettingStartedTransform}.
		 *
		 * @example
		 *
		 * ```markdown
		 * <!-- AUTO-GENERATED-CONTENT:START (EXAMPLE_GETTING_STARTED_SECTION:packageJsonPath=./package.json&usesTinylicious=TRUE&includeHeading=TRUE&headingLevel=2) -->
		 * <!-- AUTO-GENERATED-CONTENT:END -->
		 * ```
		 */
		EXAMPLE_GETTING_STARTED: exampleGettingStartedTransform,

		/**
		 * See {@link packageScopeNoticeTransform}.
		 *
		 * @example
		 *
		 * ```markdown
		 * <!-- AUTO-GENERATED-CONTENT:START (PACKAGE_SCOPE_NOTICE:packageJsonPath=./package.json) -->
		 * <!-- AUTO-GENERATED-CONTENT:END -->
		 * ```
		 */
		PACKAGE_SCOPE_NOTICE: packageScopeNoticeTransform,

		/**
		 * See {@link apiDocsTransform}.
		 *
		 * @example
		 *
		 * ```markdown
		 * <!-- AUTO-GENERATED-CONTENT:START (API_DOCS:packageJsonPath=./package.json&includeHeading=TRUE&headingLevel=2) -->
		 * <!-- AUTO-GENERATED-CONTENT:END -->
		 * ```
		 */
		API_DOCS: apiDocsTransform,

		/**
		 * See {@link installationInstructionsTransform}.
		 *
		 * @example
		 *
		 * ```markdown
		 * <!-- AUTO-GENERATED-CONTENT:START (INSTALLATION_INSTRUCTIONS:packageJsonPath=./package.json&includeHeading=TRUE&headingLevel=2&devDependency=FALSE) -->
		 * <!-- AUTO-GENERATED-CONTENT:END -->
		 * ```
		 */
		INSTALLATION_INSTRUCTIONS: installationInstructionsTransform,

		/**
		 * See {@link importInstructionsTransform}.
		 *
		 * @example
		 *
		 * ```markdown
		 * <!-- AUTO-GENERATED-CONTENT:START (IMPORT_INSTRUCTIONS:packageJsonPath=./package.json&includeHeading=TRUE&headingLevel=2) -->
		 * <!-- AUTO-GENERATED-CONTENT:END -->
		 * ```
		 */
		IMPORT_INSTRUCTIONS: importInstructionsTransform,

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
		 * <!-- AUTO-GENERATED-CONTENT:START (CLIENT_REQUIREMENTS:headingLevel=2) -->
		 * <!-- AUTO-GENERATED-CONTENT:END -->
		 * ```
		 */
		CLIENT_REQUIREMENTS: (content, options, config) =>
			templateTransform(
				"Client-Requirements-Template.md",
				parseHeadingOptions(options, "Client Requirements"),
			),

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
		 * <!-- AUTO-GENERATED-CONTENT:START (TRADEMARK:includeHeading=TRUE&includeHeading=TRUE&headingLevel=2) -->
		 * <!-- AUTO-GENERATED-CONTENT:END -->
		 * ```
		 */
		TRADEMARK: (content, options, config) =>
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
		 * <!-- AUTO-GENERATED-CONTENT:START (CONTRIBUTION_GUIDELINES:includeHeading=TRUE&includeHeading=TRUE&headingLevel=2) -->
		 * <!-- AUTO-GENERATED-CONTENT:END -->
		 * ```
		 */
		CONTRIBUTION_GUIDELINES: (content, options, config) =>
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
		 * <!-- AUTO-GENERATED-CONTENT:START (DEPENDENCY_GUIDELINES:includeHeading=TRUE&includeHeading=TRUE&headingLevel=2) -->
		 * <!-- AUTO-GENERATED-CONTENT:END -->
		 * ```
		 */
		DEPENDENCY_GUIDELINES: (content, options, config) =>
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
		 * <!-- AUTO-GENERATED-CONTENT:START (HELP:includeHeading=TRUE&includeHeading=TRUE&headingLevel=2) -->
		 * <!-- AUTO-GENERATED-CONTENT:END -->
		 * ```
		 */
		HELP: (content, options, config) =>
			templateTransform("Help-Template.md", parseHeadingOptions(options, "Help")),

		/**
		 * See {@link packageScriptsTransform}.
		 *
		 * @example
		 *
		 * ```markdown
		 * <!-- AUTO-GENERATED-CONTENT:START (PACKAGE_SCRIPTS:includeHeading=TRUE&headingLevel=2) -->
		 * <!-- AUTO-GENERATED-CONTENT:END -->
		 * ```
		 */
		PACKAGE_SCRIPTS: packageScriptsTransform,
	},
	globbyOptions: {
		gitignore: true,
		onlyFiles: true,
		deep: 5,
	},
};
