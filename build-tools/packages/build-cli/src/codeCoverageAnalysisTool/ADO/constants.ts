/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export interface IADOCodeCoverageConstants {
	// URL for the ADO org
	orgUrl: string;

	// The ADO project which contains the pipeline that generates the code coverage report artifacts to be used as baselines
	projectName: string;

	// The ID for the build that runs against main when PRs are merged
	ciBuildDefinitionId: number;

	// The name of the build artifact that contains the bundle size artifacts
	codeCoverageAnalysisArtifactName: string;

	// The guid of the repo
	// Used to post/update comments in ADO
	projectRepoGuid: string;

	// The number of most recent ADO builds to pull when searching for one associated
	// with a specific commit, default 20.  Pulling more builds takes longer, but may
	// be useful when there are a high volume of commits/builds.
	buildsToSearch?: number;
}
