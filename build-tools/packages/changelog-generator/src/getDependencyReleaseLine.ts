/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { NewChangesetWithCommit, ModCompWithPackage } from "@changesets/types";

/**
 * This function is called when a package within a release group  has updates that are due to dependency updates within
 * the release group. We don't want to include these in the changelog, so we return an empty string.
 */
const getDependencyReleaseLine = async (
	changesets: NewChangesetWithCommit[],
	dependenciesUpdated: ModCompWithPackage[],
	options: unknown,
) => {
	// Don't include dependency release lines
	// return "";
	return "REPLACE ME!";
};

export { getDependencyReleaseLine };
