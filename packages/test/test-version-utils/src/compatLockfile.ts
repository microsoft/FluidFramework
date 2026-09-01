/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

const internalRegistryMarkers = [
	"packagefeedproxy.microsoft.io",
	".pkgs.visualstudio.com/",
	"pkgs.dev.azure.com/",
	"dev.azure.com/",
] as const;

/**
 * Finds references to Microsoft-internal package registries in a compatibility lockfile.
 *
 * @remarks
 * The compatibility lockfile is committed to an open-source repository and must remain installable
 * through the public npm registry. A developer may use an internal mirror for normal work, but its
 * registry-specific metadata must not be persisted in this generated artifact.
 */
export function findInternalRegistryReferences(lockfile: string): readonly string[] {
	return lockfile
		.split(/\r?\n/)
		.flatMap((line, index) =>
			internalRegistryMarkers.some((marker) => line.includes(marker))
				? [`line ${index + 1}: ${line.trim()}`]
				: [],
		);
}

/**
 * Throws when a compatibility lockfile contains Microsoft-internal registry metadata.
 */
export function assertNoInternalRegistryReferences(
	lockfile: string,
	source = "compatibility lockfile",
): void {
	const references = findInternalRegistryReferences(lockfile);
	if (references.length === 0) {
		return;
	}

	throw new Error(
		`${source} contains Microsoft-internal registry references. Regenerate it against https://registry.npmjs.org/ before committing:\n${references.join("\n")}`,
	);
}
