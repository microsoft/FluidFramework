/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

const analyzerJsonFileName = "analyzer.json";

/**
 * Separator used in artifact directory names to encode the `/` between an npm
 * scope and a package name (e.g., `@fluid-example__bundle-size-tests`). Avoids
 * having the npm scope show up as an extra directory level in the published
 * artifact.
 */
const packageNameSeparator = "__";

/**
 * Encodes an npm package name into a single, filesystem-friendly directory
 * name by replacing `/` (the npm scope separator) with {@link packageNameSeparator}.
 */
export function encodePackageNameForPath(packageName: string): string {
	return packageName.replace(/\//g, packageNameSeparator);
}

/**
 * Inverse of {@link encodePackageNameForPath}. Decodes a directory-name-encoded
 * package name back to its npm form.
 */
export function decodePackageNameFromPath(encoded: string): string {
	return encoded.replaceAll(packageNameSeparator, "/");
}

/**
 * If `relativePath` looks like `<encoded-source-package>/analyzer.json`,
 * returns the decoded source-package name. Returns `undefined` for paths
 * that don't match that shape.
 *
 * Slashes are normalized first so the same logic handles both Windows and
 * POSIX path separators.
 */
export function sourcePackageFromAnalyzerPath(relativePath: string): string | undefined {
	const pathParts = relativePath.replace(/\\/g, "/").split("/");
	if (pathParts.length !== 2) return undefined;
	if (pathParts[1] !== analyzerJsonFileName) return undefined;
	return decodePackageNameFromPath(pathParts[0]);
}
