/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

const fs = require("fs");
const pathLib = require("path");
const scripts = require("markdown-magic-package-scripts");

const {
	embeddedContentNotice,
	generatedContentNotice,
	templatesDirectoryPath,
} = require("./constants");

const { resolveRelativePath, getPackageMetadata, getShortPackageName } = require("./utilities");

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
 * Generates the appropriately formatted Markdown section contents for the provided section body.
 * If header text is provided, a level 2 heading (i.e. `##`) will be included with the provided text.
 * The section will be wrapped in leading and trailing newlines to ensure adequate spacing between generated contents.
 *
 * @param {string} sectionBody - Body text to include in the section.
 * @param {string | undefined} maybeHeaderText - (optional) header text to display.
 * If not provided, will not include header in output.
 */
const formattedSectionText = (sectionBody, maybeHeaderText) => {
	return `\n${maybeHeaderText === undefined ? "" : `## ${maybeHeaderText}\n\n`}${sectionBody}\n`;
};

function bundlePrettierPragmas(contents) {
	return ["\n<!-- prettier-ignore-start -->", contents, "<!-- prettier-ignore-end -->\n"].join(
		"\n",
	);
}

/**
 * Bundles the provided generated contents with the {@link generatedContentNotice}, as well as
 * prettier-ignore pragmas to ensure there is not contention between our content generation and prettier's
 * formatting opinions.
 *
 * @param {string} contents - The generated Markdown contents to be included.
 */
const formattedGeneratedContentBody = (contents) => {
	return bundlePrettierPragmas([generatedContentNotice, contents].join("\n"));
};

/**
 * Bundles the provided generated contents with the {@link generatedContentNotice}, as well as
 * prettier-ignore pragmas to ensure there is not contention between our content generation and prettier's
 * formatting opinions.
 *
 * @param {string} contents - The generated Markdown contents to be included.
 */
const formattedEmbeddedContentBody = (contents) => {
	return bundlePrettierPragmas([embeddedContentNotice, contents].join("\n"));
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
	const packageDirectory = pathLib.dirname(packageJsonPath);

	const sectionBody = [];
	sectionBody.push("You can run this example using the following steps:\n");
	sectionBody.push(`1. Run \`npm install\` and \`npm run build:fast -- --nolint\` from the \`FluidFramework\` root directory.
    - For an even faster build, you can add the package name to the build command, like this:
      \`npm run build:fast -- --nolint ${packageName}\``);

	if (includeTinyliciousStep) {
		sectionBody.push(
			`1. In a separate terminal, start a Tinylicious server by following the instructions in [Tinylicious](https://github.com/microsoft/FluidFramework/tree/main/server/tinylicious).`,
		);
	}

	sectionBody.push(
		`1. Run \`npm run start\` from this directory (${packageDirectory}) and open <http://localhost:8080> in a web browser to see the app running.`,
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
 * Generats a simple Markdown heading and contents with information about API documentation for the package.
 *
 * @param {string} packageName - Name of the package (fully scoped).
 * @param {boolean} includeHeading - Whether or not to include the heading in the generated contents.
 */
const generateApiDocsLinkSection = (packageName, includeHeading) => {
	const shortName = getShortPackageName(packageName);
	const sectionBody = `API documentation for **${packageName}** is available at <https://fluidframework.com/docs/apis/${shortName}>.`;
	return formattedSectionText(sectionBody, includeHeading ? "API Documentation" : undefined);
};

/**
 * Generats a simple Markdown heading and contents with a table describing all of the package's npm scripts.
 *
 * @param {string} scriptsTable - Table of scripts to display.
 * See `markdown-magic-package-scripts` (imported as `scripts`).
 * @param {boolean} includeHeading - Whether or not to include the heading in the generated contents.
 */
const generateScriptsSection = (scriptsTable, includeHeading) => {
	return formattedSectionText(scriptsTable, includeHeading ? "Scripts" : undefined);
};

/**
 * Resolves the optionally provided file path, expressed relative to the path of the document being modified.
 *
 * @param {string} documentFilePath - Path to the document file being modified by this tooling.
 * @param {string} packageJsonFilePath - (optional) Relative file path to the package.json file for the package.
 * Default: "./package.json".
 *
 * @returns The resolved path to the package.json file.
 */
function resolveRelativePackageJsonPath(documentFilePath, packageJsonFilePath) {
	if (!packageJsonFilePath) {
		packageJsonFilePath = "./package.json";
	}
	return resolveRelativePath(documentFilePath, packageJsonFilePath);
}

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
 * @param {number | undefined} options.start - (optional) First line from the target file to be embedded (inclusive).
 * Default: 0.
 * If specified, must be on [0,`endLine`).
 * @param {number | undefined} options.end - (optional) Line of the target file at which to end the embedded range (exclusive).
 * Default: <file-line-count> + 1.
 * If specified, must be on (`startLine`,<file-line-count> + 1].
 * @param {object} config - Transform configuration.
 * @param {string} config.originalPath - Path to the document being modified.
 */
function includeTransform(content, options, config) {
	const { path: relativeFilePath, start: startLine, end: endLine } = options;
	if (!relativeFilePath) {
		throw new Error(
			"No 'path' parameter provided. Must specify a file path whose contents will be embedded.",
		);
	}

	if (startLine && endLine && startLine >= endLine) {
		throw new Error(
			`Start line must be less than end line. Got: "start: ${startLine}, end: ${endLine}".`,
		);
	}

	if (startLine < 0) {
		throw new Error("Invalid start line index. Must be 0 or positive.");
	}

	const resolvedFilePath = resolveRelativePath(config.originalPath, relativeFilePath);

	try {
		let fileContents = fs.readFileSync(resolvedFilePath, "utf8");
		if (startLine || endLine) {
			const split = fileContents.split(/\r?\n/);
			fileContents = split.slice(startLine ?? 0, endLine).join("\n");
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
 * @param {"TRUE" | "FALSE" | undefined} options.installation - (optional) Whether or not to include the package installation instructions section.
 * Default: `TRUE`.
 * @param {"TRUE" | "FALSE" | undefined} options.devDependency - (optional) Whether or not the package is intended to be installed as a devDependency.
 * Only used if `installation` is specified.
 * Default: `FALSE`.
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
	const { packageJsonPath: relativeackageJsonPath } = options;
	const resolvedPackageJsonPath = resolveRelativePackageJsonPath(
		config.originalPath,
		relativeackageJsonPath,
	);
	const packageMetadata = getPackageMetadata(resolvedPackageJsonPath);
	const packageName = packageMetadata.name;

	const sections = [];
	if (options.installation !== "FALSE") {
		sections.push(generateInstallationSection(packageName, options.devDependency, true));
	}

	if (options.apiDocs !== "FALSE") {
		sections.push(generateApiDocsLinkSection(packageName, true));
	}

	if (options.scripts === "TRUE") {
		const scriptsTable = scripts(content, options, config);
		sections.push(generateScriptsSection(scriptsTable, true));
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
 * @param {"TRUE" | "FALSE" | undefined} options.usesTinylicious - (optional) Whether or not the example app workflow uses {@link https://github.com/microsoft/FluidFramework/tree/main/server/tinylicious | Tinylicious}.
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
	const { packageJsonPath: relativeackageJsonPath } = options;

	const resolvedPackageJsonPath = resolveRelativePackageJsonPath(
		config.originalPath,
		relativeackageJsonPath,
	);

	const sections = [];
	if (options.gettingStarted !== "FALSE") {
		sections.push(
			generateGettingStartedSection(
				resolvedPackageJsonPath,
				options.usesTinylicious !== "FALSE",
				true,
			),
		);
	}

	if (options.scripts === "TRUE") {
		const scriptsTable = scripts(content, options, config);
		sections.push(generateScriptsSection(scriptsTable, true));
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
 * Generates a "Getting Started" section for an example app README.
 *
 * @param {object} content - The original document file contents.
 * @param {object} options - Transform options.
 * @param {string} options.packageJsonPath - (optional) Relative file path to the package.json file for the package.
 * Default: "./package.json".
 * @param {"TRUE" | "FALSE" | undefined} options.usesTinylicious - (optional) Whether or not the example app workflow uses {@link https://github.com/microsoft/FluidFramework/tree/main/server/tinylicious | Tinylicious}.
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
 * Generates a README section pointing readers to the published library API docs on <fluidframework.com>.
 *
 * @param {object} content - The original document file contents.
 * @param {object} options - Transform options.
 * @param {string} options.packageJsonPath - (optional) Relative file path to the package.json file for the package.
 * Default: "./package.json".
 * @param {"TRUE" | "FALSE" | undefined} options.includeHeading - (optional) Whether or not to include a Markdown heading with the generated section contents.
 * Default: `TRUE`.
 * @param {object} config - Transform configuration.
 * @param {string} config.originalPath - Path to the document being modified.
 */
function readmeApiDocsSectionTransform(content, options, config) {
	const includeHeading = options.includeHeading !== "FALSE";

	const packageMetadata = getPackageMetadataFromRelativePath(
		config.originalPath,
		options.packageJsonPath,
	);
	const packageName = packageMetadata.name;
	return formattedGeneratedContentBody(generateApiDocsLinkSection(packageName, includeHeading));
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
		 * <!-- AUTO-GENERATED-CONTENT:START (INCLUDE:path=../file.js) -->
		 * ```
		 */
		INCLUDE: includeTransform,

		/**
		 * See {@link libraryPackageReadmeTransform}.
		 *
		 * @example
		 *
		 * ```markdown
		 * <!-- AUTO-GENERATED-CONTENT:START (README_LIBRARY_PACKAGE:packageJsonPath=./package.json&installation=TRUE&devDependency=FALSE&apiDocs=TRUE&scripts=FALSE&       contributionGuidelines=TRUE&help=TRUE&trademark=TRUE&devDependency=FALSE) -->
		 * ```
		 */
		LIBRARY_PACKAGE_README: libraryPackageReadmeTransform,

		/**
		 * See {@link examplePackageReadmeTransform}.
		 *
		 * @example
		 *
		 * ```markdown
		 * <!-- AUTO-GENERATED-CONTENT:START (README_EXAMPLE_PACKAGE:packageJsonPath=./package.json&gettingStarted=TRUE&usesTinylicious=TRUE&scripts=FALSE&     contributionGuidelines=TRUE&help=TRUE&trademark=TRUE&devDependency=FALSE) -->
		 * ```
		 */
		EXAMPLE_PACKAGE_README: examplePackageReadmeTransform,

		/**
		 * See {@link readmeExampleGettingStartedSectionTransform}.
		 *
		 * @example
		 *
		 * ```markdown
		 * <!-- AUTO-GENERATED-CONTENT:START (README_EXAMPLE_GETTING_STARTED_SECTION:packageJsonPath=./package.json&usesTinylicious=TRUE) -->
		 * ```
		 */
		README_EXAMPLE_GETTING_STARTED_SECTION: readmeExampleGettingStartedSectionTransform,

		/**
		 * See {@link readmeApiDocsSectionTransform}.
		 *
		 * @example
		 *
		 * ```markdown
		 * <!-- AUTO-GENERATED-CONTENT:START (README_API_DOCS_SECTION:packageJsonPath=./package.json&includeHeading=TRUE) -->
		 * ```
		 */
		README_API_DOCS_SECTION: readmeApiDocsSectionTransform,

		/**
		 * See {@link }.
		 *
		 * @example
		 *
		 * ```markdown
		 * <!-- AUTO-GENERATED-CONTENT:START (README_INSTALLATION_SECTION:packageJsonPath=./package.json&includeHeading=TRUE&devDependency=FALSE) -->
		 * ```
		 */
		README_INSTALLATION_SECTION: readmeInstallationSectionTransform,

		/* Match <!-- AUTO-GENERATED-CONTENT:START (README_TRADEMARK_SECTION:includeHeading=TRUE) --> */
		README_TRADEMARK_SECTION(content, options, config) {
			const includeHeading = options.includeHeading !== "FALSE";
			return formattedGeneratedContentBody(generateTrademarkSection(includeHeading));
		},

		/* Match <!-- AUTO-GENERATED-CONTENT:START (README_CONTRIBUTION_GUIDELINES_SECTION:includeHeading=TRUE) --> */
		README_CONTRIBUTION_GUIDELINES_SECTION(content, options, config) {
			const includeHeading = options.includeHeading !== "FALSE";
			return formattedGeneratedContentBody(
				generateContributionGuidelinesSection(includeHeading),
			);
		},

		/* Match <!-- AUTO-GENERATED-CONTENT:START (README_HELP_SECTION:includeHeading=TRUE) --> */
		README_HELP_SECTION(content, options, config) {
			const includeHeading = options.includeHeading !== "FALSE";
			return formattedGeneratedContentBody(generateHelpSection(includeHeading));
		},

		/* Match <!-- AUTO-GENERATED-CONTENT:START (PACKAGE_JSON_SCRIPTS:includeHeading=TRUE) --> */
		PACKAGE_JSON_SCRIPTS(content, options, config) {
			const includeHeading = options.includeHeading !== "FALSE";
			const scriptsTable = scripts(content, options, config);
			return formattedGeneratedContentBody(
				generateScriptsSection(scriptsTable, includeHeading),
			);
		},
	},
	// callback: function () {
	// 	console.log("done");
	// },
	globbyOptions: {
		gitignore: true,
		onlyFiles: true,
		deep: 5,
	},
};
