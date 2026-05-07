/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { WebApi } from "azure-devops-node-api";
import { BuildResult, BuildStatus } from "azure-devops-node-api/interfaces/BuildInterfaces";
import type JSZip from "jszip";
import { join } from "path";

import type { BundleComparison } from "../BundleBuddyTypes";
import { compareBundles } from "../compareBundles";
import { getBaselineCommit, getBuilds } from "../utilities";
import {
	getAnalyzerJsonFromZip,
	getAnalyzerPathsFromZipObject,
	getZipObjectFromArtifact,
} from "./AdoArtifactFileProvider";
import type { IADOConstants } from "./Constants";
import {
	getAnalyzerJsonFromFileSystem,
	getAnalyzerPathsFromFileSystem,
} from "./FileSystemBundleFileProvider";
import { getBundleSummariesFromAnalyzer } from "./getBundleSummaries";

/**
 * Result of a size comparison against a baseline build, discriminated by `kind`.
 *
 * On `"success"`, `comparison` holds the bundle diff against `baselineCommit`.
 * On `"error"`, the comparison could not be produced and `error` holds the reason;
 * `baselineCommit` reflects the last commit that was attempted and may be `undefined`
 * if the search never found a candidate.
 */
export type SizeComparison =
	| { kind: "success"; baselineCommit: string; comparison: BundleComparison[] }
	| { kind: "error"; baselineCommit: string | undefined; error: string };

export class ADOSizeComparator {
	/**
	 * The default number of most recent builds on the ADO pipeline to search when
	 * looking for a build matching a baseline commit.  The most recent builds may not
	 * necessarily match the chain of commits, but typically will when the pipeline
	 * only builds commits to main.
	 */
	private static readonly defaultBuildsToSearch = 20;

	constructor(
		/**
		 * ADO constants identifying where to fetch baseline bundle info
		 */
		private readonly adoConstants: IADOConstants,
		/**
		 * The ADO connection to use to fetch baseline bundle info
		 */
		private readonly adoConnection: WebApi,
		/**
		 * Path to existing local bundle size reports
		 */
		private readonly localReportPath: string,
		/**
		 * Name of the target branch the current branch will merge into. Used to compute
		 * the baseline commit (`git merge-base origin/<targetBranch> HEAD`).
		 */
		private readonly targetBranch: string,
	) {}

	/**
	 * Run the bundle size comparison against the baseline build.
	 *
	 * @returns A {@link SizeComparison} tagged with `kind: "success"` or `kind: "error"`.
	 * Never throws: unexpected exceptions from underlying `git` shell-outs, ADO API
	 * calls, or stats-file parsing are caught and reported via the `error` variant so
	 * callers can rely on the return shape.
	 */
	public async getSizeComparison(): Promise<SizeComparison> {
		// Declared outside the try block so the catch can still report the last-known
		// commit value in the synthesized error variant.
		let baselineCommit: string | undefined;
		try {
			baselineCommit = getBaselineCommit(this.targetBranch);
			console.log(`The baseline commit for this PR is ${baselineCommit}`);

			const recentBuilds = await getBuilds(this.adoConnection, {
				project: this.adoConstants.projectName,
				definitions: [this.adoConstants.ciBuildDefinitionId],
				maxBuildsPerDefinition:
					this.adoConstants.buildsToSearch ?? ADOSizeComparator.defaultBuildsToSearch,
			});

			const baselineBuild = recentBuilds.find(
				(build) => build.sourceVersion === baselineCommit,
			);

			if (baselineBuild === undefined) {
				const error = `No CI build found for baseline commit ${baselineCommit}`;
				console.log(error);
				return { kind: "error", baselineCommit, error };
			}

			if (baselineBuild.id === undefined) {
				const error = `Baseline build does not have a build id`;
				console.log(error);
				return { kind: "error", baselineCommit, error };
			}

			if (baselineBuild.status !== BuildStatus.Completed) {
				const error = "Baseline build for this PR has not yet completed.";
				console.log(error);
				return { kind: "error", baselineCommit, error };
			}

			if (baselineBuild.result !== BuildResult.Succeeded) {
				const error = "Baseline CI build failed, cannot generate bundle analysis at this time";
				console.log(error);
				return { kind: "error", baselineCommit, error };
			}

			console.log(`Found baseline build with id: ${baselineBuild.id}`);
			console.log(`projectName: ${this.adoConstants.projectName}`);
			console.log(`artifactName: ${this.adoConstants.artifactName}`);

			const baselineZip = await getZipObjectFromArtifact(
				this.adoConnection,
				this.adoConstants.projectName,
				baselineBuild.id,
				this.adoConstants.artifactName,
			).catch((error) => {
				console.log(`Error unzipping object from artifact: ${error.message}`);
				console.log(`Error stack: ${error.stack}`);
				return undefined;
			});

			if (baselineZip === undefined) {
				const error = "Baseline build did not publish bundle artifacts";
				console.log(error);
				return { kind: "error", baselineCommit, error };
			}

			const comparison: BundleComparison[] = await this.createComparisonFromZip(baselineZip);
			console.log(JSON.stringify(comparison));

			return { kind: "success", baselineCommit, comparison };
		} catch (e) {
			const error = `Unexpected failure during size comparison: ${
				e instanceof Error ? e.message : String(e)
			}`;
			console.log(error);
			return { kind: "error", baselineCommit, error };
		}
	}

	private async createComparisonFromZip(baselineZip: JSZip): Promise<BundleComparison[]> {
		const baselineZipBundlePaths = getAnalyzerPathsFromZipObject(baselineZip);

		const prBundleFileSystemPaths = await getAnalyzerPathsFromFileSystem(this.localReportPath);

		const baselineSummaries = await getBundleSummariesFromAnalyzer({
			bundlePaths: baselineZipBundlePaths,
			getAnalyzerJson: (relativePath) => getAnalyzerJsonFromZip(baselineZip, relativePath),
		});

		const prSummaries = await getBundleSummariesFromAnalyzer({
			bundlePaths: prBundleFileSystemPaths,
			getAnalyzerJson: (relativePath) =>
				getAnalyzerJsonFromFileSystem(join(this.localReportPath, relativePath)),
		});

		return compareBundles(baselineSummaries, prSummaries);
	}
}
