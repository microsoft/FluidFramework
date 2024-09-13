/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { getZipObjectFromArtifact } from "@fluidframework/bundle-size-tools";
import type { WebApi } from "azure-devops-node-api";
import { BuildResult, BuildStatus } from "azure-devops-node-api/interfaces/BuildInterfaces.js";
import type { Build } from "azure-devops-node-api/interfaces/BuildInterfaces.js";
import type JSZip from "jszip";
import type { CommandLogger } from "../../logging.js";
import type { IAzureDevopsBuildCoverageConstants } from "./constants.js";
import {
	Metric,
	getBaselineCommit,
	getBuilds,
	getPriorCommit,
	getSimpleComment,
} from "./utils.js";

export interface IBaselineBuildMetrics {
	baselineBuild: Build & { id: number };
	/**
	 * The commit hash corresponding to the baseline build
	 */
	baselineCommit: string;
	/**
	 * The artifact that was published by the baseline build in zip format
	 */
	baselineArtifactZip: JSZip;
	/**
	 * True if the build was successful, false if otherwise. We can sometimes still do analysis even on failed builds
	 */
	isBuildSuccessful: boolean;
}

/**
 * Naive fallback generator provided for convenience.  It yields the commit directly
 * prior to the previous commit.
 * @remarks This duplicates a function in build-tools/packages/bundle-size-tools/src/ADO/AdoSizeComparator.ts, we should consolidate them.
 */
function* naiveFallbackCommitGenerator(
	startingCommit: string,
	buildsToSearch?: number,
): Generator<string> {
	let currentCommit = startingCommit;
	for (let i = 0; i < (buildsToSearch ?? 50); i++) {
		currentCommit = getPriorCommit(currentCommit);
		yield currentCommit;
	}
}

/**
 * Method that returns buildId and commit for the baseline build along with the commit hash for the current PR
 * @param metric - The metric for which the baseline build is being fetched, such as code coverage or bundle analysis
 * @param codeCoverageConstants - Code coverage constants for the project
 * @param adoConnection - The connection to the Azure DevOps API
 */
export async function getBaselineBuildMetrics(
	metric: Metric,
	azureDevopsBuildCoverageConstants: IAzureDevopsBuildCoverageConstants,
	adoConnection: WebApi,
	logger?: CommandLogger,
): Promise<IBaselineBuildMetrics | string | undefined> {
	let baselineCommit = getBaselineCommit();
	logger?.verbose(`The baseline commit for this PR is ${baselineCommit}`);

	// Some circumstances may want us to try a fallback, such as when a commit does
	// not trigger any CI loops.  Use fallback generator in that case.
	const fallbackGen = naiveFallbackCommitGenerator(
		baselineCommit,
		azureDevopsBuildCoverageConstants.buildsToSearch,
	);
	const recentBuilds = await getBuilds(adoConnection, {
		project: azureDevopsBuildCoverageConstants.projectName,
		definitions: [azureDevopsBuildCoverageConstants.ciBuildDefinitionId],
		maxBuildsPerDefinition: azureDevopsBuildCoverageConstants.buildsToSearch ?? 50,
	});

	let baselineBuild: Build | undefined;
	let baselineArtifactZip: JSZip | undefined;
	while (baselineCommit !== undefined) {
		baselineBuild = recentBuilds.find((build) => {
			return build.sourceVersion === baselineCommit;
		});

		if (baselineBuild === undefined) {
			baselineCommit = fallbackGen.next().value as string;
			// For reasons that I don't understand, the "undefined" string is omitted in the log output, which makes the
			// output very confusing. The string is capitalized here and elsewhere in this file as a workaround.
			logger?.info(
				`Trying backup baseline commit when baseline build is UNDEFINED: ${baselineCommit}`,
			);
			continue;
		}

		// Baseline build does not have id
		if (baselineBuild.id === undefined) {
			const message = `Baseline build does not have a build id`;
			logger?.info(message);
			return message;
		}

		if (baselineBuild.status !== BuildStatus.Completed) {
			const message = getSimpleComment(
				"Baseline build for this PR has not yet completed.",
				baselineCommit,
				baselineBuild,
				metric,
			);
			logger?.info(message);
			return message;
		}

		// Baseline build failed
		if (baselineBuild.result !== BuildResult.Succeeded) {
			const message = getSimpleComment(
				"Baseline CI build failed, cannot generate bundle analysis at this time",
				baselineCommit,
				baselineBuild,
				metric,
			);
			logger?.info(message);
			return message;
		}

		// Baseline build succeeded
		logger?.verbose(`Found baseline build with id: ${baselineBuild.id}`);
		logger?.verbose(`projectName: ${azureDevopsBuildCoverageConstants.projectName}`);
		logger?.verbose(
			`codeCoverageAnalysisArtifactName: ${azureDevopsBuildCoverageConstants.artifactName}`,
		);

		// eslint-disable-next-line no-await-in-loop
		baselineArtifactZip = await getZipObjectFromArtifact(
			adoConnection,
			azureDevopsBuildCoverageConstants.projectName,
			baselineBuild.id,
			azureDevopsBuildCoverageConstants.artifactName,
		).catch((error: Error) => {
			logger?.verbose(
				`Failed to fetch and/or unzip artifact '${azureDevopsBuildCoverageConstants.artifactName}' from CI build. Cannot generate analysis at this time`,
			);
			logger?.verbose(`Error: ${error.message}`);
			logger?.verbose(`Error stack: ${error.stack}`);
			return undefined;
		});

		// For reasons that I don't understand, the "undefined" string is omitted in the log output, which makes the
		// output very confusing. The string is capitalized here and elsewhere in this file as a workaround.
		logger?.verbose(`Baseline Zip === UNDEFINED: ${baselineArtifactZip === undefined}`);

		// Successful baseline build does not have the needed build artifacts
		if (baselineArtifactZip === undefined) {
			// eslint-disable-next-line require-atomic-updates
			baselineCommit = fallbackGen.next().value as string;
			logger?.verbose(
				`Trying backup baseline commit when successful baseline build does not have the needed build artifacts ${baselineCommit}`,
			);
			continue;
		}

		// Found usable baseline zip
		break;
	}

	// Unable to find a usable baseline
	if (baselineCommit === undefined || baselineArtifactZip === undefined) {
		const message = `Could not find a usable baseline build with search starting at CI ${getBaselineCommit()}`;
		logger?.verbose(message);
		return message;
	}

	if (!baselineBuild) {
		const message = `Could not find baseline build for CI ${baselineCommit}`;
		logger?.verbose(message);
		return message;
	}

	const isBuildSuccessful =
		baselineBuild.result === BuildResult.Succeeded ||
		baselineBuild.result === BuildResult.PartiallySucceeded;

	if (!isBuildSuccessful) {
		logger?.verbose(
			`Baseline build failed. We can still do analysis on the failed build, but it may not be complete as some packages may be missing.`,
		);
	}
	// Baseline build does not have id
	if (baselineBuild.id === undefined) {
		const message = `Baseline build does not have a build id`;
		logger?.verbose(message);
		return message;
	}

	logger?.verbose(`Found baseline build with id: ${baselineBuild.id}`);

	return {
		baselineBuild: { ...baselineBuild, id: baselineBuild.id },
		baselineCommit,
		baselineArtifactZip,
		isBuildSuccessful,
	};
}
