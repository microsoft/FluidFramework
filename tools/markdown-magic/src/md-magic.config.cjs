/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

const { PackageName } = require("@rushstack/node-core-library");
const fs = require("fs");
const pathLib = require("path");
const scripts = require("markdown-magic-package-scripts");

const { templatesDirectoryPath } = require("./constants.cjs");
const {
	formattedEmbeddedContentBody,
	formattedGeneratedContentBody,
	formattedSectionText,
	getPackageMetadata,
	resolveRelativePackageJsonPath,
	resolveRelativePath,
} = require("./utilities.cjs");
const {
	apiDocsLinkSectionTransform,
	generateApiDocsLinkSection,
	generatePackageImportInstructionsSection,
	generatePackageScriptsSection,
	packageImportInstructionsSectionTransform,
	packageScriptsSectionTransform,
} = require("./transforms/index.cjs");

/**
 * Reads and returns the contents from the specified template file.
 *
 * @param {string} templateFileName - Name of the file to read, under {@link templatesDirectoryPath} (e.g. "Trademark-Template.md").
 */
const readTemplate = (templateFileName) => {
	return fs
		.readFileSync(pathLib.resolve(templatesDirectoryPath, templateFileName), {
			encoding: "utf-8",
		})
		.trim();
};

/**
 * Generates a `Getting Started` heading and contents for the specified package.
 *
 * @param {string} packageJsonPath - The path to the package's `package.json` file.
 * @param {boolean} includeTinyliciousStep - Whether or not to include the `Tinylicious` step in the instructions.
 * @param {boolean} includeHeading - Whether or not to include the heading in the generated contents.
 */
const generateGettingStartedSection = (packageJsonPath, includeTinyliciousStep, includeHeading) => {
	const packageJsonMetadata = getPackageMetadata(packageJsonPath);
	const packageName = packageJsonMetadata.name;

	const sectionBody = [];
	sectionBody.push("You can run this example using the following steps:\n");
	sectionBody.push(
		"1. Enable [corepack](https://nodejs.org/docs/latest-v16.x/api/corepack.html) by running `corepack enable`.",
	);
	sectionBody.push(`1. Run \`pnpm install\` and \`pnpm run build:fast --nolint\` from the \`FluidFramework\` root directory.
    - For an even faster build, you can add the package name to the build command, like this:
      \`pnpm run build:fast --nolint ${packageName}\``);

	if (includeTinyliciousStep) {
		sectionBody.push(
			`1. In a separate terminal, start a Tinylicious server by following the instructions in [Tinylicious](https://github.com/microsoft/FluidFramework/tree/main/server/routerlicious/packages/tinylicious).`,
		);
	}

	sectionBody.push(
		`1. Run \`pnpm start\` from this directory and open <http://localhost:8080> in a web browser to see the app running.`,
	);

	return formattedSectionText(
		sectionBody.join("\n"),
		includeHeading ? "Getting Started" : undefined,
	);
};

/**
 * Generats a simple Markdown heading and contents with package installation instructions.
 *
 * @param {string} packageName - Name of the package (fully scoped).
 * @param {boolean} devDependency - Whether or not the package is intended to be installed as a dev dependency.
 * @param {boolean} includeHeading - Whether or not to include the heading in the generated contents.
 */
const generateInstallationSection = (packageName, devDependency, includeHeading) => {
	const sectionBody = `To get started, install the package by running the following command:

\`\`\`bash
npm i ${packageName}${devDependency ? " -D" : ""}
\`\`\``;

	return formattedSectionText(sectionBody, includeHeading ? "Installation" : undefined);
};

/**
 * Generats a simple Markdown heading and contents with trademark information.
 *
 * @param {boolean} includeHeading - Whether or not to include the heading in the generated contents.
 */
const generateTrademarkSection = (includeHeading) => {
	const sectionBody = readTemplate("Trademark-Template.md");
	return formattedSectionText(sectionBody, includeHeading ? "Trademark" : undefined);
};

/**
 * Generats a simple Markdown heading and contents with guidelines for taking dependencies on Fluid libraries.
 *
 * @param {boolean} includeHeading - Whether or not to include the heading in the generated contents.
 */
const generateDependencyGuidelines = (includeHeading) => {
	const sectionBody = readTemplate("Dependency-Guidelines-Template.md");
	return formattedSectionText(
		sectionBody,
		includeHeading ? "Using Fluid Framework libraries" : undefined,
	);
};

/**
 * Generates a Markdown heading and contents with a section pointing developers to our contribution guidelines.
 *
 * @param {boolean} includeHeading - Whether or not to include the heading in the generated contents.
 */
const generateContributionGuidelinesSection = (includeHeading) => {
	const sectionBody = readTemplate("Contribution-Guidelines-Template.md");
	return formattedSectionText(
		sectionBody,
		includeHeading ? "Contribution Guidelines" : undefined,
	);
};

/**
 * Generats a simple Markdown heading and contents with a section pointing developers to other sources of documentation,
 * and to our issue tracker.
 *
 * @param {boolean} includeHeading - Whether or not to include the heading in the generated contents.
 */
const generateHelpSection = (includeHeading) => {
	const sectionBody = readTemplate("Help-Template.md");
	return formattedSectionText(sectionBody, includeHeading ? "Help" : undefined);
};

/**
 * Generates simple Markdown contents indicating that the associated package is experimental.
 */
const generateExperimentalPackageNotice = () => {
	const rawContents = readTemplate("Experimental-Package-Notice-Template.md");
	return formattedSectionText(rawContents, undefined);
};

/**
 * Generates simple Markdown contents indicating that the associated package is internal to the fluid-framework
 * (published, but not intended for external consumption).
 */
const generateInternalPackageNotice = () => {
	const rawContents = readTemplate("Internal-Package-Notice-Template.md");
	return formattedSectionText(rawContents, undefined);
};

/**
 * Generates simple Markdown contents indicating that the associated package is private to the fluid-framework
 * (unpublished - used only within the repo).
 */
const generatePrivatePackageNotice = () => {
	const rawContents = readTemplate("Private-Package-Notice-Template.md");
	return formattedSectionText(rawContents, undefined);
};

/**
 * Generates simple Markdown contents indicating implications of the specified kind of package scope.
 *
 * @param {"EXPERIMENTAL" | "INTERNAL" | "PRIVATE"} kind - Scope kind to switch on.
 * EXPERIMENTAL: See templates/Experimental-Package-Notice-Template.md.
 * INTERNAL: See templates/Internal-Package-Notice-Template.md.
 * PRIVATE: See templates/Private-Package-Notice-Template.md.
 */
const generatePackageScopeNotice = (kind) => {
	switch (kind) {
		case "EXPERIMENTAL":
			return generateExperimentalPackageNotice();
		case "INTERNAL":
			return generateInternalPackageNotice();
		case "PRIVATE":
			return generatePrivatePackageNotice();
		default:
			throw new Error(`Unrecognized package scope kind: ${kind}`);
	}
};

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
 * Gets the package.json metadata from the optionally provided file path, expressed relative
 * to the path of the document being modified.
 *
 * @param {string} documentFilePath - Path to the document file being modified by this tooling.
 * @param {string} packageJsonFilePath - (optional) Relative file path to the package.json file for the package.
 * Default: "./package.json".
 *
 * @returns The package.json content metadata.
 */
function getPackageMetadataFromRelativePath(documentFilePath, packageJsonFilePath) {
	const resolvedPackageJsonPath = resolveRelativePackageJsonPath(
		documentFilePath,
		packageJsonFilePath,
	);
	return getPackageMetadata(resolvedPackageJsonPath);
}

/**
 * Embeds contents from the specified file paths within the provided (optional) line boundaries.
 *
 * @param {object} content - The original document file contents.
 * @param {object} options - Transform options.
 * @param {string} options.path - Relative path from the document to the file being embedded.
 * @param {string | undefined} options.start - (optional) First line from the target file to be embedded (inclusive).
 * Expected to be a string-formatted integer.
 * Default: 0.
 * Constraints are the same as those for the `end` parameter to
 * {@link https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/slice#parameters | Array.slice}
 * @param {string | undefined} options.end - (optional) Line of the target file at which to end the embedded range (exclusive).
 * Expected to be a string-formatted integer.
 * Default: <file-line-count> + 1.
 * Constraints are the same as those for the `end` parameter to
 * {@link https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/slice#parameters | Array.slice}
 * @param {object} config - Transform configuration.
 * @param {string} config.originalPath - Path to the document being modified.
 */
function includeTransform(content, options, config) {
	const { path: relativeFilePath, start: startLineString, end: endLineString } = options;
	const { originalPath: documentFilePath } = config;

	const startLine = startLineString === undefined ? undefined : Number.parseInt(startLineString);
	const endLine = endLineString === undefined ? undefined : Number.parseInt(endLineString);

	if (!relativeFilePath) {
		throw new Error(
			"No 'path' parameter provided. Must specify a relative path to the file containing the contents to be embedded.",
		);
	}

	const resolvedFilePath = resolveRelativePath(documentFilePath, relativeFilePath);

	try {
		let fileContents = fs.readFileSync(resolvedFilePath, "utf8");
		if (startLine || endLine) {
			const split = fileContents.split(/\r?\n/);
			fileContents = split.slice(startLine, endLine).join("\n");
		}
		const section = formattedSectionText(fileContents.trim());

		return formattedEmbeddedContentBody(section);
	} catch (error) {
		console.error(`Exception processing "${resolvedFilePath}":`, error);
		throw error;
	}
}

/**
 * Generates simple README contents for a library package.
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
			generateInstallationSection(packageName, options.devDependency, true),
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
			generateGettingStartedSection(
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
 * Generates a "Getting Started" section for an example app README.
 *
 * @param {object} content - The original document file contents.
 * @param {object} options - Transform options.
 * @param {string} options.packageJsonPath - (optional) Relative file path to the package.json file for the package.
 * Default: "./package.json".
 * @param {"TRUE" | "FALSE" | undefined} options.usesTinylicious - (optional) Whether or not the example app workflow uses {@link https://github.com/microsoft/FluidFramework/tree/main/server/routerlicious/packages/tinylicious | Tinylicious}.
 * Default: `TRUE`.
 * @param {"TRUE" | "FALSE" | undefined} options.includeHeading - (optional) Whether or not to include a Markdown heading with the generated section contents.
 * Default: `TRUE`.
 * @param {object} config - Transform configuration.
 * @param {string} config.originalPath - Path to the document being modified.
 */
function readmeExampleGettingStartedSectionTransform(content, options, config) {
	const usesTinylicious = options.usesTinylicious !== "FALSE";
	const includeHeading = options.includeHeading !== "FALSE";

	const packageJsonPath = resolveRelativePackageJsonPath(
		config.originalPath,
		options.packageJsonPath,
	);
	return formattedGeneratedContentBody(
		generateGettingStartedSection(packageJsonPath, usesTinylicious, includeHeading),
	);
}

/**
 * Generates a README section with package installation instructions.
 *
 * @param {object} content - The original document file contents.
 * @param {object} options - Transform options.
 * @param {string} options.packageJsonPath - (optional) Relative file path to the package.json file for the package.
 * Default: "./package.json".
 * @param {"TRUE" | "FALSE" | undefined} options.includeHeading - (optional) Whether or not to include a Markdown heading with the generated section contents.
 * Default: `TRUE`.
 * @param {"TRUE" | "FALSE" | undefined} options.devDependency - (optional) Whether or not the package is intended to be installed as a dev dependency.
 * Default: `FALSE`.
 * @param {object} config - Transform configuration.
 * @param {string} config.originalPath - Path to the document being modified.
 */
function readmeInstallationSectionTransform(content, options, config) {
	const includeHeading = options.includeHeading !== "FALSE";
	const devDependency = options.devDependency === "TRUE";

	const packageMetadata = getPackageMetadataFromRelativePath(
		config.originalPath,
		options.packageJsonPath,
	);
	const packageName = packageMetadata.name;
	return formattedGeneratedContentBody(
		generateInstallationSection(packageName, devDependency, includeHeading),
	);
}

/**
 * Generates simple Markdown contents indicating implications of the specified kind of package scope.
 *
 * @param {object} content - The original document file contents.
 * @param {object} options - Transform options.
 * @param {string} options.packageJsonPath - (optional) Relative file path to the package.json file for the package.
 * Default: "./package.json".
 * @param {"EXPERIMENTAL" | "INTERNAL" | "PRIVATE" | undefined} scopeKind - Scope kind to switch on.
 * EXPERIMENTAL: See templates/Experimental-Package-Notice-Template.md.
 * INTERNAL: See templates/Internal-Package-Notice-Template.md.
 * PRIVATE: See templates/Private-Package-Notice-Template.md.
 * `undefined`: Inherit from package namespace (fluid-experimental, fluid-internal, fluid-private).
 * @param {object} config - Transform configuration.
 * @param {string} config.originalPath - Path to the document being modified.
 */
function readmePackageScopeNoticeTransform(content, options, config) {
	const { packageJsonPath, scopeKind } = options;

	const packageMetadata = getPackageMetadataFromRelativePath(
		config.originalPath,
		packageJsonPath,
	);
	const packageName = packageMetadata.name;

	// Note: if the user specified an explicit scope, that takes precedence over the package namespace.
	const scopeKindWithInheritance = scopeKind ?? getScopeKindFromPackage(packageName);
	if (scopeKindWithInheritance !== undefined) {
		return generatePackageScopeNotice(scopeKindWithInheritance);
	}
}

/**
 * Generates a README section with Microsoft trademark info.
 *
 * @param {object} content - The original document file contents.
 * @param {object} options - Transform options.
 * @param {"TRUE" | "FALSE" | undefined} options.includeHeading - (optional) Whether or not to include a Markdown heading with the generated section contents.
 * Default: `TRUE`.
 * @param {object} config - Transform configuration.
 * @param {string} config.originalPath - Path to the document being modified.
 */
function readmeTrademarkSectionTransform(content, options, config) {
	const includeHeading = options.includeHeading !== "FALSE";
	return formattedGeneratedContentBody(generateTrademarkSection(includeHeading));
}

/**
 * Generates a README section with fluid-framework contribution guidelines.
 *
 * @param {object} content - The original document file contents.
 * @param {object} options - Transform options.
 * @param {"TRUE" | "FALSE" | undefined} options.includeHeading - (optional) Whether or not to include a Markdown heading with the generated section contents.
 * Default: `TRUE`.
 * @param {object} config - Transform configuration.
 * @param {string} config.originalPath - Path to the document being modified.
 */
function readmeContributionGuidelinesSectionTransform(content, options, config) {
	const includeHeading = options.includeHeading !== "FALSE";
	return formattedGeneratedContentBody(generateContributionGuidelinesSection(includeHeading));
}

/**
 * Generates a README section with fluid-framework dependency guidelines.
 *
 * @param {object} content - The original document file contents.
 * @param {object} options - Transform options.
 * @param {"TRUE" | "FALSE" | undefined} options.includeHeading - (optional) Whether or not to include a Markdown heading with the generated section contents.
 * Default: `TRUE`.
 * @param {object} config - Transform configuration.
 * @param {string} config.originalPath - Path to the document being modified.
 */
function readmeDependencyGuidelinesSectionTransform(content, options, config) {
	const includeHeading = options.includeHeading !== "FALSE";
	return formattedGeneratedContentBody(generateDependencyGuidelines(includeHeading));
}

/**
 * Generates a README "help" section.
 *
 * @param {object} content - The original document file contents.
 * @param {object} options - Transform options.
 * @param {"TRUE" | "FALSE" | undefined} options.includeHeading - (optional) Whether or not to include a Markdown heading with the generated section contents.
 * Default: `TRUE`.
 * @param {object} config - Transform configuration.
 * @param {string} config.originalPath - Path to the document being modified.
 */
function readmeHelpSectionTransform(content, options, config) {
	const includeHeading = options.includeHeading !== "FALSE";
	return formattedGeneratedContentBody(generateHelpSection(includeHeading));
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
		 * See {@link readmeExampleGettingStartedSectionTransform}.
		 *
		 * @example
		 *
		 * ```markdown
		 * <!-- AUTO-GENERATED-CONTENT:START (README_EXAMPLE_GETTING_STARTED_SECTION:packageJsonPath=./package.json&usesTinylicious=TRUE&includeHeading=TRUE) -->
		 * <!-- AUTO-GENERATED-CONTENT:END -->
		 * ```
		 */
		README_EXAMPLE_GETTING_STARTED_SECTION: readmeExampleGettingStartedSectionTransform,

		/**
		 * See {@link readmePackageScopeNoticeTransform}.
		 *
		 * @example
		 *
		 * ```markdown
		 * <!-- AUTO-GENERATED-CONTENT:START (README_PACKAGE_SCOPE_NOTICE:packageJsonPath=./package.json) -->
		 * <!-- AUTO-GENERATED-CONTENT:END -->
		 * ```
		 */
		README_PACKAGE_SCOPE_NOTICE: readmePackageScopeNoticeTransform,

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
		 * See {@link readmeInstallationSectionTransform}.
		 *
		 * @example
		 *
		 * ```markdown
		 * <!-- AUTO-GENERATED-CONTENT:START (README_INSTALLATION_SECTION:packageJsonPath=./package.json&includeHeading=TRUE&devDependency=FALSE) -->
		 * <!-- AUTO-GENERATED-CONTENT:END -->
		 * ```
		 */
		README_INSTALLATION_SECTION: readmeInstallationSectionTransform,

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
		 * See {@link readmeTrademarkSectionTransform}.
		 *
		 * @example
		 *
		 * ```markdown
		 * <!-- AUTO-GENERATED-CONTENT:START (README_TRADEMARK_SECTION:includeHeading=TRUE) -->
		 * <!-- AUTO-GENERATED-CONTENT:END -->
		 * ```
		 */
		README_TRADEMARK_SECTION: readmeTrademarkSectionTransform,

		/**
		 * See {@link readmeContributionGuidelinesSectionTransform}.
		 *
		 * @example
		 *
		 * ```markdown
		 * <!-- AUTO-GENERATED-CONTENT:START (README_CONTRIBUTION_GUIDELINES_SECTION:includeHeading=TRUE) -->
		 * <!-- AUTO-GENERATED-CONTENT:END -->
		 * ```
		 */
		README_CONTRIBUTION_GUIDELINES_SECTION: readmeContributionGuidelinesSectionTransform,

		/**
		 * See {@link readmeContributionGuidelinesSectionTransform}.
		 *
		 * @example
		 *
		 * ```markdown
		 * <!-- AUTO-GENERATED-CONTENT:START (README_DEPENDENCY_GUIDELINES_SECTION:includeHeading=TRUE) -->
		 * <!-- AUTO-GENERATED-CONTENT:END -->
		 * ```
		 */
		README_DEPENDENCY_GUIDELINES_SECTION: readmeDependencyGuidelinesSectionTransform,

		/**
		 * See {@link readmeHelpSectionTransform}.
		 *
		 * @example
		 *
		 * ```markdown
		 * <!-- AUTO-GENERATED-CONTENT:START (README_HELP_SECTION:includeHeading=TRUE) -->
		 * <!-- AUTO-GENERATED-CONTENT:END -->
		 * ```
		 */
		README_HELP_SECTION: readmeHelpSectionTransform,

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
