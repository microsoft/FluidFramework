/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

const fs = require("fs");
const path = require("path");

/**
 * Resolves the provided relative path from its document path.
 *
 * @param {string} documentPath - The path to the document this system is modifying.
 * @param {string} relativePath - A path, relative to `documentPath`, to resolve.
 */
function resolveRelativePath(documentPath, relativePath) {
	return path.resolve(path.dirname(documentPath), relativePath);
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
 * Gets a package short-name (unscoped-name) from a scoped package name.
 *
 * @param {string} scopedPackageName - A scoped package name.
 */
function getShortPackageName(scopedPackageName) {
	const arr = scopedPackageName.split("/", 2);
	if (arr[1]) {
		return arr[1];
	}
	return arr[0];
}

/**
 * Gets the path (relative to the `docs` directory) to the package directory given the path to its `package.json` file.
 *
 * @param {string} packageJsonPath - Path to the package's `package.json` file.
 */
function getPackageDirectoryPath(packageJsonPath) {
	return path.dirname(packageJsonPath);
}

module.exports = {
	resolveRelativePath,
	getPackageMetadata,
	getShortPackageName,
	getPackageDirectoryPath,
};
