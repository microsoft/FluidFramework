/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

const {
	formattedSectionText,
	getPackageMetadata,
	getScopeKindFromPackage,
	readTemplate,
	resolveRelativePackageJsonPath,
} = require("../utilities.cjs");

/**
 * Generates simple Markdown contents indicating implications of the specified kind of package scope.
 *
 * @param {string} kind - Scope kind to switch on.
 * EXPERIMENTAL: See templates/Experimental-Package-Notice-Template.md.
 * INTERNAL: See templates/Internal-Package-Notice-Template.md.
 * PRIVATE: See templates/Private-Package-Notice-Template.md.
 * TOOLS: See templates/Tools-Package-Notice-Template.md.
 *
 * @returns The appropriate notice, if applicable. Otherwise, `undefined`.
 */
const generatePackageScopeNotice = (kind) => {
	let rawContents;
	switch (kind) {
		case "EXAMPLE":
			rawContents = readTemplate("Example-Package-Notice-Template.md");
			break;
		case "EXPERIMENTAL":
			rawContents = readTemplate("Experimental-Package-Notice-Template.md");
			break;
		case "INTERNAL":
			rawContents = readTemplate("Internal-Package-Notice-Template.md");
			break;
		case "PRIVATE":
			rawContents = readTemplate("Private-Package-Notice-Template.md");
			break;
		case "TOOLS":
			rawContents = readTemplate("Tools-Package-Notice-Template.md");
			break;
		default:
			return undefined;
	}

	return formattedSectionText(rawContents, /* headingOptions: */ undefined);
};

/**
 * Generates simple Markdown contents indicating implications of the specified kind of package scope.
 *
 * @param {object} content - The original document file contents.
 * @param {object} options - Transform options.
 * @param {string} options.packageJsonPath - (optional) Relative file path to the package.json file for the package.
 * Default: "./package.json".
 * @param {string | undefined} scopeKind - Scope kind to switch on.
 * EXAMPLE: See templates/Example-Package-Notice-Template.md.
 * EXPERIMENTAL: See templates/Experimental-Package-Notice-Template.md.
 * INTERNAL: See templates/Internal-Package-Notice-Template.md.
 * PRIVATE: See templates/Private-Package-Notice-Template.md.
 * TOOLS: See templates/Tools-Package-Notice-Template.md.
 * `undefined`: Inherit from package namespace (`fluid-experimental`, `fluid-internal`, `fluid-private`, `fluid-tools`, etc.).
 * @param {object} config - Transform configuration.
 * @param {string} config.originalPath - Path to the document being modified.
 */
function packageScopeNoticeTransform(content, options, config) {
	const { packageJsonPath, scopeKind } = options;

	const resolvedPackageJsonPath = resolveRelativePackageJsonPath(
		config.originalPath,
		packageJsonPath,
	);
	const packageMetadata = getPackageMetadata(resolvedPackageJsonPath);
	const packageName = packageMetadata.name;

	// Note: if the user specified an explicit scope, that takes precedence over the package namespace.
	const scopeKindWithInheritance = scopeKind ?? getScopeKindFromPackage(packageName);
	return generatePackageScopeNotice(scopeKindWithInheritance);
}

module.exports = {
	generatePackageScopeNotice,
	packageScopeNoticeTransform,
};
