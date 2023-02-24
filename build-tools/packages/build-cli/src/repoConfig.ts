/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import minimatch from "minimatch";
import { ReleaseGroup, ReleasePackage } from "./releaseGroups";

// Mapping of branch to a list of release groups/packages that should run policy by default.
// TODO: This should be configured in the fluid-build config, like type test defaults are.
const defaults = {
	"main": ["client"],
	"release/*": ["client"],
};

/**
 * Returns true if policy-check should run by default for a given branch/release group combination.
 */
export const getPolicyRunDefault = (
	releaseGroupOrPackage: ReleaseGroup | ReleasePackage,
	branch: string,
): boolean => {
	for (const [branchPattern, shouldRunPolicy] of Object.entries(defaults)) {
		if (minimatch(branch, branchPattern) === true) {
			return shouldRunPolicy.includes(releaseGroupOrPackage);
		}
	}

	return false;
};
