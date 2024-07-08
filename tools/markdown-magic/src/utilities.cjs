/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

const fs = require("fs");
const path = require("path");
const { PackageName } = require("@rushstack/node-core-library");

const {
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

	const unmodifiedContents = fs
		.readFileSync(path.resolve(templatesDirectoryPath, templateFileName), {
			encoding: "utf-8",
		})
		.trim();

	if (headingOffset === 0) {
		return unmodifiedContents;
	}

	const headingOffsetString = "#".repeat(headingOffset);
	return unmodifiedContents.replace(/(^#)/gm, `$1${headingOffsetString}`);
};

/**
 * Generates a simple block of Markdown contents by embedding the specified template and (optionally) including a header.
 *
 * @param {string} templateName - The name of the template file to embed.
 * @param {object} options - Content generation options.
 * @param {number} options.headingLevel - Root heading level for the generated section.
 * If 0, no heading will be included.
 * Must be a non-negative integer.
 * @param {string} options.headingText - Text to display in the section heading, if one was requested.
 */
const createSectionFromTemplate = (templateName, options) => {
	const sectionBody = readTemplate(templateName);
	return formattedSectionText(sectionBody, options);
};

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
 * Generates the appropriately formatted Markdown section contents for the provided section body.
 * If header text is provided, a level 2 heading (i.e. `##`) will be included with the provided text.
 * The section will be wrapped in leading and trailing newlines to ensure adequate spacing between generated contents.
 *
 * @param {string} sectionBody - Body text to include in the section.
 * @param {object} options - Content generation options.
 * @param {number} options.headingLevel - Root heading level for the generated section.
 * If 0, no heading will be included.
 * Must be a non-negative integer.
 * @param {string} options.headingText - Text to display in the section heading, if one was requested.
 */
function formattedSectionText(sectionBody, { headingLevel, headingText }) {
	if (!Number.isInteger(headingLevel) || headingLevel < 0) {
		throw new TypeError(`"headingLevel" must be a positive integer. Got "${headingLevel}".`);
	}
	return `\n${
		headingLevel === 0 ? "" : `${"#".repeat(headingLevel)} ${headingText}\n\n`
	}${sectionBody}\n`;
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
 * Parses the string representation of a MarkdownMagic parameter as an integer and returns it.
 * Returns the default value if the parameter was not provided.
 * @param {string | undefined} paramString - The string representation of the parameter to parse.
 * @param {number} defaultValue - The default value to return if the parameter was not provided.
 * @throws If the parameter was provided, but is not an integer.
 */
function parseIntegerOptionOrDefault(paramString, defaultValue) {
	return paramString ? Number.parseInt(paramString) ?? defaultValue : defaultValue;
}

module.exports = {
	createSectionFromTemplate,
	formattedSectionText,
	formattedGeneratedContentBody,
	formattedEmbeddedContentBody,
	getPackageMetadata,
	getScopeKindFromPackage,
	parseIntegerOptionOrDefault,
	readTemplate,
	resolveRelativePackageJsonPath,
	resolveRelativePath,
};
