/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IWholeFlatSummary } from "@fluidframework/server-services-client";
import { ISummaryVersion, IWholeSummaryOptions } from "./definitions";
import { Constants } from "./constants";
import { buildFullGitTreeFromGitTree, convertFullGitTreeToFullSummaryTree } from "./conversions";

/**
 * Retrieve the summary version (commit) for a given sha.
 * If the sha is "latest", retrieves the latest version for the given documentId.
 */
async function getSummaryVersion(
	summarySha: string,
	options: IWholeSummaryOptions,
): Promise<ISummaryVersion> {
	if (summarySha === Constants.LatestSummarySha) {
		// Retrieve latest 1 commit pointed at by the ref for the given documentId.
		const commitDetails = await options.repoManager.getCommits(options.documentId, 1, {
			enabled: options.externalStorageEnabled,
		});
		return {
			id: commitDetails[0].sha,
			treeId: commitDetails[0].commit.tree.sha,
		};
	}
	const commit = await options.repoManager.getCommit(summarySha);
	return { id: commit.sha, treeId: commit.tree.sha };
}

/**
 * Read the summary with the given ID (sha) from Git storage as a flat summary that is readable by the Routerlicious Driver.
 */
export async function readSummary(
	summarySha: string,
	options: IWholeSummaryOptions,
): Promise<IWholeFlatSummary> {
	const { id: versionId, treeId } = await getSummaryVersion(summarySha, options);
	const gitTree = await options.repoManager.getTree(treeId, true);
	const fullGitTree = await buildFullGitTreeFromGitTree(
		gitTree,
		options.repoManager,
		{} /* blobCache */,
		true /* parseInnerFullGitTrees */,
		true /* retrieveBlobs */,
	);
	const { treeEntries, blobs } = convertFullGitTreeToFullSummaryTree(fullGitTree);
	return {
		id: versionId,
		trees: [
			{
				id: treeId,
				entries: treeEntries,
				// We don't store sequence numbers in git
				// This must be typecast to number currently because Gitrest is out of spec with the type definition.
				sequenceNumber: undefined as unknown as number,
			},
		],
		blobs,
	};
}
