/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

const analyzerJsonFileName = "analyzer.json";

/**
 * If `relativePath` looks like `<sourcePackage>/analyzer.json` (nested layout —
 * e.g. `@fluid-example/bundle-size-tests/analyzer.json`), returns the source
 * package name. Returns `undefined` for paths that don't match.
 *
 * Slashes are normalized first so the same logic handles both Windows and
 * POSIX path separators.
 */
export function sourcePackageFromAnalyzerPath(relativePath: string): string | undefined {
	const pathParts = relativePath.replace(/\\/g, "/").split("/");
	if (pathParts.at(-1) !== analyzerJsonFileName) return undefined;
	pathParts.pop();
	if (pathParts.length === 0) return undefined;
	return pathParts.join("/");
}
