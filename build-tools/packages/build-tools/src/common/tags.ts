/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import * as semver from "semver";

/**
 * Parses the version from a git tag.
 *
 * @param tag - The tag.
 * @returns - The version string, or undefined if one could not be found.
 *
 * @internal
 */
export function getVersionFromTag(tag: string): string | undefined {
	// This is sufficient, but there is a possibility that this will fail if we add a tag that includes "_v" in its
	// name.
	const tagSplit = tag.split("_v");
	if (tagSplit.length !== 2) {
		return undefined;
	}

	const ver = semver.parse(tagSplit[1]);
	if (ver === null) {
		return undefined;
	}

	return ver.version;
}
