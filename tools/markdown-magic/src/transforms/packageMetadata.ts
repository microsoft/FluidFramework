/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { TransformContext } from "../types.js";

/**
 * Package metadata used to generate package documentation.
 */
export interface PackageMetadata {
	/**
	 * The npm package name.
	 */
	name: string;

	/**
	 * Whether npm treats the package as private.
	 */
	private?: boolean;

	/**
	 * The package export map indexed by subpath.
	 */
	exports?: Record<string, unknown>;

	/**
	 * The package scripts indexed by command name.
	 */
	scripts?: Record<string, string>;
}

/**
 * The supported Fluid package scope classifications.
 */
export const scopeValues = [
	"FRAMEWORK",
	"EXAMPLE",
	"EXPERIMENTAL",
	"INTERNAL",
	"PRIVATE",
	"TOOLS",
] as const;

/**
 * A Fluid package classification derived from its npm scope.
 */
export type ScopeKind = (typeof scopeValues)[number];

/**
 * Reads package metadata relative to the destination document.
 *
 * @param context - The services and destination details for the transform.
 * @param options - The package metadata path option.
 * @returns The parsed package metadata.
 */
export async function readPackage(
	context: TransformContext,
	options: { packageJsonPath: string },
): Promise<PackageMetadata> {
	const packagePath = context.resolvePath(options.packageJsonPath);
	return JSON.parse(await context.readFile(packagePath, "utf8")) as PackageMetadata;
}

/**
 * Maps a package name to a supported Fluid package classification.
 *
 * @param packageName - The npm package name to classify.
 * @returns The package classification, or `undefined` for an unsupported scope.
 */
export function getScopeKind(packageName: string): ScopeKind | undefined {
	if (packageName === "fluid-framework") {
		return "FRAMEWORK";
	}
	const scope = packageName.startsWith("@") ? packageName.split("/")[0] : "";
	return (
		{
			"@fluidframework": "FRAMEWORK",
			"@fluid-example": "EXAMPLE",
			"@fluid-experimental": "EXPERIMENTAL",
			"@fluid-internal": "INTERNAL",
			"@fluid-private": "PRIVATE",
			"@fluid-tools": "TOOLS",
		} as const
	)[
		scope as
			| "@fluidframework"
			| "@fluid-example"
			| "@fluid-experimental"
			| "@fluid-internal"
			| "@fluid-private"
			| "@fluid-tools"
	];
}

/**
 * Tests whether package defaults must include public guidance.
 *
 * @param packageMetadata - The package metadata to test.
 * @returns `true` for public framework and experimental packages; otherwise, `false`.
 */
export function isPublic(packageMetadata: PackageMetadata): boolean {
	if (packageMetadata.private === true) {
		return false;
	}
	return (
		getScopeKind(packageMetadata.name) === "FRAMEWORK" ||
		getScopeKind(packageMetadata.name) === "EXPERIMENTAL"
	);
}
