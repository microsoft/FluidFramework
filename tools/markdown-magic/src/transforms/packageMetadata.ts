/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { TransformContext } from "../types.js";

export interface PackageMetadata {
	name: string;
	private?: boolean;
	exports?: Record<string, unknown>;
	scripts?: Record<string, string>;
}

export type ScopeKind = (typeof scopeValues)[number];

export const scopeValues = [
	"FRAMEWORK",
	"EXAMPLE",
	"EXPERIMENTAL",
	"INTERNAL",
	"PRIVATE",
	"TOOLS",
] as const;

/** Reads package metadata relative to the destination document. */
export async function readPackage(
	context: TransformContext,
	options: { packageJsonPath: string },
): Promise<PackageMetadata> {
	const packagePath = context.resolvePath(options.packageJsonPath);
	return JSON.parse(await context.readFile(packagePath, "utf8")) as PackageMetadata;
}

/** Maps a package name to a supported Fluid package kind. */
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

/** Tests whether package defaults must include public guidance. */
export function isPublic(packageMetadata: PackageMetadata): boolean {
	if (packageMetadata.private === true) {
		return false;
	}
	return (
		getScopeKind(packageMetadata.name) === "FRAMEWORK" ||
		getScopeKind(packageMetadata.name) === "EXPERIMENTAL"
	);
}
