/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export interface IAzureDevopsBuildCoverageConstants {
	/**
	 * URL for the ADO org.
	 */
	orgUrl: string;

	/**
	 * The ADO project which contains the pipeline that generates the code coverage report artifacts.
	 */
	projectName: string;

	/**
	 * The ADO ID of the pipeline (aka `definitionId`) that runs against main when PRs are merged and
	 * generates the code coverage artifacts.
	 */
	ciBuildDefinitionId: number;

	/**
	 * The name of the build artifact that contains the artifact to be used as for analysis.
	 */
	artifactName: string;

	/**
	 * The number of most recent ADO builds to pull when searching for a particular build. Pulling more
	 * builds takes longer, but may be useful when there are a high volume of commits/builds.
	 */
	buildsToSearch?: number;

	/**
	 * The branch for which the build is searched.
	 */
	branch?: string;

	/**
	 * Current Build ID of the PR for which code coverage analysis will be done.
	 */
	buildId?: number;
}
