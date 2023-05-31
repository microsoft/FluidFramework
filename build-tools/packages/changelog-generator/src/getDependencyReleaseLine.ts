/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { NewChangesetWithCommit, ModCompWithPackage } from "@changesets/types";

/**
 * Based on Changesets' default `getDependencyReleaseLine`
 */
const getDependencyReleaseLine = async (
	changesets: NewChangesetWithCommit[],
	dependenciesUpdated: ModCompWithPackage[],
	options: unknown,
) => {
	// Don't include dependency release lines
	return "";
};

export { getDependencyReleaseLine };
