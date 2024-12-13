/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

const fs = require("fs");
const path = require("path");
const { PackageName } = require("@rushstack/node-core-library");

const {
	defaultSectionHeadingLevel,
	embeddedContentNotice,
	generatedContentNotice,
	templatesDirectoryPath,
} = require("./constants.cjs");

/**
 * Reads and returns the contents from the specified template file.
 *
 * @param {string} templateFileName - Name of the file to read, under {@link templatesDirectoryPath} (e.g. "Trademark-Template.md").
 * @param {number} headingOffset - (optional) Level offset for all headings in the target template.
 * Must be a non-negative integer.
 */
const readTemplate = (templateFileName, headingOffset = 0) => {
	if (!Number.isInteger(headingOffset) || headingOffset < 0) {
		throw new TypeError(
			`"headingOffset" must be a non-negative integer. Got "${headingOffset}".`,
		);
	}

	const unmodifiedContents = readFile(path.resolve(templatesDirectoryPath, templateFileName));

	if (headingOffset === 0) {
		return unmodifiedContents;
	}

	const headingOffsetString = "#".repeat(headingOffset);
	return unmodifiedContents.replace(/(^#)/gm, `$1${headingOffsetString}`);
};


/**
 * Reads contents of the target file within the provided (optional) line boundaries.
 *
 * @param {string} filePath - Path to the file being read.
 * @param {number | undefined} startLine - (optional) First line from the target file to be embedded (inclusive).
 * Default: 0.
 * Constraints are the same as those for the `end` parameter to
 * {@link https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/slice#parameters | Array.slice}
 * @param {number | undefined} endLine - (optional) Line of the target file at which to end the embedded range (exclusive).
 * Default: <file-line-count> + 1.
 * Constraints are the same as those for the `end` parameter to
 * {@link https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/slice#parameters | Array.slice}
 */
function readFile(filePath, startLine, endLine) {
	let fileContents = fs.readFileSync(filePath, "utf8");
	if (startLine || endLine) {
		const split = fileContents.split(/\r?\n/);
		fileContents = split.slice(startLine, endLine).join("\n");
	}
	return fileContents.trim();
}

/**
 * Resolves the provided relative path from its document path.
 *
 * @param {string} documentPath - The path to the document this system is modifying.
 * @param {string} relativePath - A path, relative to `documentPath`, to resolve.
 */
function resolveRelativePath(documentPath, relativePath) {
	const resolvedFilePath = path.resolve(path.dirname(documentPath), relativePath);

	if (!fs.existsSync(resolvedFilePath)) {
		throw new Error(
			`"${documentPath}": Encountered invalid relative file path "${relativePath}". "${resolvedFilePath}" does not exist.`,
		);
	}

	return resolvedFilePath;
}

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
 * Gets the package's `package.json` contents, given the path to its package.json file.
 *
 * @param {string} packageJsonFilePath - Path to a `package.json` file.
 */
function getPackageMetadata(packageJsonFilePath) {
	try {
		const packageJson = JSON.parse(fs.readFileSync(packageJsonFilePath, "utf8"));
		return packageJson;
	} catch (error) {
		console.error(error);
		throw error;
	}
}

/**
 * Gets the appropriate special scope kind for the provided package name, if applicable.
 *
 * @remarks for an overview of the Fluid Framework's package scopes, see {@link https://github.com/microsoft/FluidFramework/wiki/npm-package-scopes}.
 *
 * @param {string} packageName
 * @returns {"" | "FRAMEWORK" | "EXAMPLE" | "EXPERIMENTAL" | "INTERNAL" | "PRIVATE" | "TOOLS" | undefined}
 * A scope kind based on the package's scope (namespace).
 * Will be an empty string if the package has no scope.
 * Will be `undefined` if the package has an unrecognized scope.
 */
const getScopeKindFromPackage = (packageName) => {
	const packageScope = PackageName.getScope(packageName);
	if (packageScope === "") {
		return "";
	} else if (packageScope === "@fluidframework") {
		return "FRAMEWORK";
	} else if (packageScope === "@fluid-example") {
		return "EXAMPLE";
	} else if (packageScope === "@fluid-experimental") {
		return "EXPERIMENTAL";
	} else if (packageScope === "@fluid-internal") {
		return "INTERNAL";
	} else if (packageScope === "@fluid-private") {
		return "PRIVATE";
	} else if (packageScope === "@fluid-tools") {
		return "TOOLS";
	} else {
		return undefined;
	}
};

/**
 * Determines if the package is end-user facing or not.
 * For the purposes of README content generation, this is true for "fluid-framework" and published packages in the
 * "@fluidframework" and "@fluid-experimental" scopes.
 *
 * Will always return `false` if the package.json specifies`"private": true`.
 *
 * @remarks Used to determine which automatically generated sections should be included in package READMEs, etc.
 * @param {object} packageMetadata - The parsed `package.json` file for the package.
 */
const isPublic = (packageMetadata) => {
	// If the package is not published, return `false`.
	if (packageMetadata.private === true) {
		return false;
	}

	// For published packages, only return `true` for package scopes for which we offer public support.
	const packageName = packageMetadata.name;
	if (packageName === "fluid-framework") {
		return true;
	}

	const scope = getScopeKindFromPackage(packageName);
	return scope === "FRAMEWORK" || scope === "EXPERIMENTAL";
};

/**
 * Generates the appropriately formatted Markdown section contents for the provided section body.
 * If header text is provided, a level 2 heading (i.e. `##`) will be included with the provided text.
 * The section will be wrapped in leading and trailing newlines to ensure adequate spacing between generated contents.
 *
 * @param {string} sectionBody - Body text to include in the section.
 * @param {object} headingOptions - (optional) Heading generation options.
 * @param {boolean} headingOptions.includeHeading - Whether or not to include a top-level heading in the generated section.
 * @param {number} headingOptions.headingLevel - Root heading level for the generated section.
 * Must be a positive integer.
 * @param {string} headingOptions.headingText - Text to display in the section heading, if one was requested.
 */
function formattedSectionText(sectionBody, headingOptions) {
	let heading = "";
	if (headingOptions?.includeHeading) {
		const { headingLevel, headingText } = headingOptions;
		if (!Number.isInteger(headingLevel) || headingLevel < 1) {
			throw new TypeError(
				`"headingLevel" must be a positive integer. Got "${headingLevel}".`,
			);
		}
		heading = `${"#".repeat(headingLevel)} ${headingText}\n\n`;
	}

	return `\n${heading}${sectionBody}\n`;
}

/**
 * Wraps the provided generated / embedded content in prettier-ignore pragma comments.
 * @param {string} contents - The Markdown contents to be wrapped.
 */
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
function formattedGeneratedContentBody(contents) {
	return bundlePrettierPragmas([generatedContentNotice, contents].join("\n"));
}

/**
 * Bundles the provided generated contents with the {@link generatedContentNotice}, as well as
 * prettier-ignore pragmas to ensure there is not contention between our content generation and prettier's
 * formatting opinions.
 *
 * @param {string} contents - The generated Markdown contents to be included.
 */
function formattedEmbeddedContentBody(contents) {
	return bundlePrettierPragmas([embeddedContentNotice, contents].join("\n"));
}

/**
 * Parses the provided MarkdownMagic transform options to generate the appropriate section heading options.
 *
 * @param {object} options - Transform options.
 * @param {"TRUE" | "FALSE" | undefined} includeHeading - (optional) Whether or not to include a top-level heading in the generated section.
 * default: `TRUE`.
 * @param {number | undefined} options.headingLevel - (optional) Heading level for the section.
 * Must be a positive integer.
 * Default: {@link defaultSectionHeadingLevel}.
 * @param {string} headingText - The text to display in the section heading.
 *
 * @typedef {Object} HeadingOptions
 * @property {boolean} includeHeading - Whether or not to include a heading in the generated content.
 * @property {number} headingLevel - The heading level for the section.
 * @property {string} headingText - The text to display in the section heading.
 *
 * @returns {HeadingOptions} Heading generation options.
 */
function parseHeadingOptions(transformationOptions, headingText) {
	return {
		includeHeading: transformationOptions.includeHeading !== "FALSE",
		headingLevel: transformationOptions.headingLevel
			? Number.parseInt(transformationOptions.headingLevel) ?? defaultSectionHeadingLevel
			: defaultSectionHeadingLevel,
		headingText: headingText,
	};
}

/**
 * Parses a provided "boolean" (i.e., "TRUE" | "FALSE") MarkdownMagic transform option.
 * Returns the provided default if no option was specified.
 * @param {"TRUE" | "FALSE" | undefined} option
 * @param {function} defaultValue - The default value, or a callback that returns the default value to use for the option.
 * Used if the option is not explicitly provided.
 */
function parseBooleanOption(option, defaultValue) {
	if (option === "TRUE") {
		return true;
	}
	if (option === "FALSE") {
		return false;
	}
	if (typeof defaultValue === "function") {
		return defaultValue();
	}
	return defaultValue;
}

module.exports = {
	formattedSectionText,
	formattedGeneratedContentBody,
	formattedEmbeddedContentBody,
	getPackageMetadata,
	getScopeKindFromPackage,
	isPublic,
	parseBooleanOption,
	parseHeadingOptions,
	readFile,
	readTemplate,
	resolveRelativePackageJsonPath,
	resolveRelativePath,
};
