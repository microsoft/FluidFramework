/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

const analyzerJsonSuffix = "/analyzer.json";

/**
 * If `relativePath` looks like `<sourcePackage>/analyzer.json` (nested layout —
 * e.g. `@fluid-example/bundle-size-tests/analyzer.json`), returns the source
 * package name. Returns `undefined` for paths that don't match.
 *
 * Slashes are normalized first so the same logic handles both Windows and
 * POSIX path separators.
 */
export function sourcePackageFromAnalyzerPath(relativePath: string): string | undefined {
	const normalized = relativePath.replace(/\\/g, "/");
	if (!normalized.endsWith(analyzerJsonSuffix)) return undefined;
	const sourcePackage = normalized.slice(0, -analyzerJsonSuffix.length);
	return sourcePackage.length === 0 ? undefined : sourcePackage;
}
