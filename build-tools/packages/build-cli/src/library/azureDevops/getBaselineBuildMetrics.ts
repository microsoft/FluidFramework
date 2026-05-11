/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";
import type { WebApi } from "azure-devops-node-api";
import type { Build } from "azure-devops-node-api/interfaces/BuildInterfaces.js";
import { BuildResult } from "azure-devops-node-api/interfaces/BuildInterfaces.js";
import type { CommandLogger } from "../../logging.js";
import type { IAzureDevopsBuildCoverageConstants } from "./constants.js";
import { type ArtifactContents, downloadArtifact } from "./downloadArtifact.js";
import { getBuild, getBuilds } from "./utils.js";

export interface IBuildMetrics {
	build: Build & { id: number };
	/**
	 * The decompressed contents of the artifact that was published by the build,
	 * keyed by file path relative to the artifact root.
	 */
	artifactContents: ArtifactContents;
}

/**
 * Method that returns the build artifact for a baseline build.
 * @param azureDevopsBuildCoverageConstants - Code coverage constants for the project.
 * @param adoApi - The connection to the Azure DevOps API
 * @param logger - The logger to log messages.
 */
export async function getBaselineBuildMetrics(
	azureDevopsBuildCoverageConstants: IAzureDevopsBuildCoverageConstants,
	adoApi: WebApi,
	logger?: CommandLogger,
): Promise<IBuildMetrics> {
	const recentBuilds = await getBuilds(adoApi, {
		project: azureDevopsBuildCoverageConstants.projectName,
		definitions: [azureDevopsBuildCoverageConstants.ciBuildDefinitionId],
		branch:
			azureDevopsBuildCoverageConstants.branch === undefined
				? undefined
				: `refs/heads/${azureDevopsBuildCoverageConstants.branch}`,
		maxBuildsPerDefinition: azureDevopsBuildCoverageConstants.buildsToSearch ?? 50,
	});

	let baselineBuild: Build | undefined;
	let baselineArtifactContents: ArtifactContents | undefined;
	for (const build of recentBuilds) {
		if (build.result !== BuildResult.Succeeded) {
			continue;
		}

		// Baseline build does not have id
		if (build.id === undefined) {
			const message = `Baseline build does not have a build id`;
			logger?.warning(message);
			throw new Error(message);
		}

		// Baseline build succeeded
		logger?.verbose(`Found baseline build with id: ${build.id}`);
		logger?.verbose(`projectName: ${azureDevopsBuildCoverageConstants.projectName}`);
		logger?.verbose(
			`codeCoverageAnalysisArtifactName: ${azureDevopsBuildCoverageConstants.artifactName}`,
		);

		// eslint-disable-next-line no-await-in-loop
		baselineArtifactContents = await downloadArtifact(
			adoApi,
			azureDevopsBuildCoverageConstants.projectName,
			build.id,
			`${azureDevopsBuildCoverageConstants.artifactName}_${build.id}`,
		).catch((error: Error) => {
			logger?.warning(
				`Failed to fetch and/or unzip artifact '${azureDevopsBuildCoverageConstants.artifactName}' from CI build. Cannot generate analysis at this time`,
			);
			logger?.warning(`Error: ${error.message}`);
			logger?.warning(`Error stack: ${error.stack}`);
			return undefined;
		});

		// For reasons that I don't understand, the "undefined" string is omitted in the log output, which makes the
		// output very confusing. The string is capitalized here and elsewhere in this file as a workaround.
		logger?.verbose(
			`Baseline artifact contents === UNDEFINED: ${baselineArtifactContents === undefined}`,
		);

		// Successful baseline build does not have the needed build artifacts
		if (baselineArtifactContents === undefined) {
			logger?.warning(
				`Trying backup builds when successful baseline build does not have the needed build artifacts ${build.id}`,
			);
			continue;
		}
		// Found usable baseline contents, so break out of the loop early.
		baselineBuild = build;
		break;
	}

	// Unable to find a usable baseline
	if (baselineArtifactContents === undefined) {
		const message = `Could not find a usable baseline build`;
		logger?.warning(message);
		throw new Error(message);
	}

	if (!baselineBuild) {
		const message = `Could not find baseline build for CI`;
		logger?.warning(message);
		throw new Error(message);
	}

	// Baseline build does not have id
	if (baselineBuild.id === undefined) {
		const message = `Baseline build does not have a build id`;
		logger?.warning(message);
		throw new Error(message);
	}

	logger?.verbose(`Found baseline build with id: ${baselineBuild.id}`);

	return {
		build: { ...baselineBuild, id: baselineBuild.id },
		artifactContents: baselineArtifactContents,
	};
}

/**
 * Method that returns the build artifact for a specific build.
 * @param azureDevopsBuildCoverageConstants - Code coverage constants for the project.
 * @param adoApi - The connection to the Azure DevOps API
 * @param logger - The logger to log messages.
 */
export async function getBuildArtifactForSpecificBuild(
	azureDevopsBuildCoverageConstants: IAzureDevopsBuildCoverageConstants,
	adoApi: WebApi,
	logger?: CommandLogger,
): Promise<IBuildMetrics> {
	assert(azureDevopsBuildCoverageConstants.buildId !== undefined, "buildId is required");
	logger?.verbose(`The buildId id ${azureDevopsBuildCoverageConstants.buildId}`);

	const build: Build = await getBuild(
		adoApi,
		{
			project: azureDevopsBuildCoverageConstants.projectName,
			definitions: [azureDevopsBuildCoverageConstants.ciBuildDefinitionId],
			maxBuildsPerDefinition: azureDevopsBuildCoverageConstants.buildsToSearch ?? 20,
		},
		azureDevopsBuildCoverageConstants.buildId,
	);

	// Build does not have id
	if (build.id === undefined) {
		const message = `build does not have a build id`;
		logger?.warning(message);
		throw new Error(message);
	}

	logger?.verbose(`Found build with id: ${build.id}`);
	logger?.verbose(`projectName: ${azureDevopsBuildCoverageConstants.projectName}`);
	logger?.verbose(
		`codeCoverageAnalysisArtifactName: ${azureDevopsBuildCoverageConstants.artifactName}`,
	);

	const artifactContents: ArtifactContents | undefined = await downloadArtifact(
		adoApi,
		azureDevopsBuildCoverageConstants.projectName,
		build.id,
		`${azureDevopsBuildCoverageConstants.artifactName}_${build.id}`,
	).catch((error: Error) => {
		logger?.warning(
			`Failed to fetch and/or unzip artifact '${azureDevopsBuildCoverageConstants.artifactName}' from CI build. Cannot generate analysis at this time`,
		);
		logger?.warning(`Error: ${error.message}`);
		logger?.warning(`Error stack: ${error.stack}`);
		return undefined;
	});

	// For reasons that I don't understand, the "undefined" string is omitted in the log output, which makes the
	// output very confusing. The string is capitalized here and elsewhere in this file as a workaround.
	logger?.verbose(`Artifact contents === UNDEFINED: ${artifactContents === undefined}`);
	if (artifactContents === undefined) {
		const message = `Could not find a usable artifact`;
		logger?.warning(message);
		throw new Error(message);
	}

	return {
		build: { ...build, id: build.id },
		artifactContents,
	};
}
