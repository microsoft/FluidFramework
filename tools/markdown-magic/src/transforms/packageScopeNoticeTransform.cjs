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
 * Generates simple Markdown contents indicating that the associated package is experimental.
 */
const generateExperimentalPackageNotice = () => {
	const rawContents = readTemplate("Experimental-Package-Notice-Template.md");
	return formattedSectionText(rawContents, /* headingOptions: */ undefined);
};

/**
 * Generates simple Markdown contents indicating that the associated package is internal to the fluid-framework
 * (published, but not intended for external consumption).
 */
const generateInternalPackageNotice = () => {
	const rawContents = readTemplate("Internal-Package-Notice-Template.md");
	return formattedSectionText(rawContents, /* headingOptions: */ undefined);
};

/**
 * Generates simple Markdown contents indicating that the associated package is private to the fluid-framework
 * (unpublished - used only within the repo).
 */
const generatePrivatePackageNotice = () => {
	const rawContents = readTemplate("Private-Package-Notice-Template.md");
	return formattedSectionText(rawContents, /* headingOptions: */ undefined);
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
	if (scopeKindWithInheritance !== undefined) {
		return generatePackageScopeNotice(scopeKindWithInheritance);
	}
}

module.exports = {
	generatePackageScopeNotice,
	packageScopeNoticeTransform,
};
