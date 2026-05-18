/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export interface IADOConstants {
	// URL for the ADO org
	orgUrl: string;

	// The ADO project that contains the repo
	projectName: string;

	// The ID for the build that runs against main when PRs are merged
	ciBuildDefinitionId: number;

	// The name of the build artifact that contains the bundle size data
	artifactName: string;

	// The number of most recent ADO builds to pull when searching for one associated
	// with a specific commit, default 20.  Pulling more builds takes longer, but may
	// be useful when there are a high volume of commits/builds.
	buildsToSearch?: number;
}
