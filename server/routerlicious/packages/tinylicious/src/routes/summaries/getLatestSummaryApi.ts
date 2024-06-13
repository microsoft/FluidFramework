/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Router } from "express";
import type { ICommitDetails } from "@fluidframework/gitresources";
import type { ITenant, ITenantManager } from "@fluidframework/server-services-core";
import { getParam } from "../../utils";

export function createGetLatestSummaryApiRoute(
	tenantManager: ITenantManager,
	router: Router,
): Router {
	router.get("/latest/:tenantId/:documentId", (request, response) => {
		console.log("received summary get request");
		const documentId = getParam(request.params, "documentId");
		const tenantId = getParam(request.params, "tenantId");

		const tenantManagerP = tenantManager.getTenant(tenantId, documentId);

		tenantManagerP
			.then(async (tenant) => {
				const apiResponse: GetSummaryApiResponse = await getLatestSummary(
					tenant,
					documentId,
				);
				return response.status(200).json(apiResponse);
			})
			.catch((error) => {
				console.log(error);
				response.status(400).json(error);
			});
	});

	return router;
}

/**
 * Object returned by the getSummary route
 */
export interface GetSummaryApiResponse {
	/**
	 * Information about the commit in which the DDS data is from.
	 * This is useful for seeing if the data is from a newly initialized (app) or a summary of a app and if so how new it is.
	 *
	 * @example
	 * A newly created document will have the following in the field gitCommit.commit.message:
	 * ```
	 * "New document\n"
	 * ```
	 *
	 * 	 * @example
	 * A summary created from a document will have a string *similar* to the following in gitCommit.commit.message:
	 * ```
	 * "Summary @22:20\n"
	 * ```
	 *
	 *
	 */
	gitCommit: ICommitDetails;
	/**
	 * Summaries of the content and attributes of each dds within the document.
	 */
	ddsSummaries: {
		/**
		 * Serialized form of {@link IChannelAttributes} which contains metadata about the DDS such as what type of dds it is.
		 *
		 * @example
		 * Here are a few examples of potential values of the attributes.type field for some DDS's.
		 *```
		 * - "https://graph.microsoft.com/types/counter"
		 * - "https://graph.microsoft.com/types/map"
		 * - "https://graph.microsoft.com/types/mergeTree"
		 * - "https://graph.microsoft.com/types/directory"
		 * ```
		 */
		attributes: string;
		/**
		 * Serialized json of a summary of what the contents/data within the DDS are.
		 */
		contents: string;
	}[];
}

/**
 * API Logic to get the summary of app data for a given document and tenant id
 */
async function getLatestSummary(
	tenant: ITenant,
	documentId: string,
): Promise<GetSummaryApiResponse> {
	const commits = await tenant.gitManager.getCommits(documentId, 1);
	const treeHash = commits[0].commit?.tree?.sha;
	console.log(" tenant.gitManager.getCommits(documentId, 1) returned:", commits);
	console.log(`Document git tree hash is ${treeHash}`);

	const fullTree = await tenant.gitManager.getTree(treeHash, true);
	console.log("obtained full tree: ", fullTree);

	const ddsSummaryMap = new Map<string, { content?: string; attributes?: string }>();
	for (const item of fullTree.tree) {
		if (item.path.startsWith(".channels") && item.type === "blob") {
			if (item.path.endsWith(".component")) {
				// Not sure what this data is supposed to be but it doesn't seem useful
				continue;
			}

			// 1. Identify UUID for the DDS
			let ddsCommitChannelId;
			const pathParts = item.path.split("/");
			if (pathParts.length > 3) {
				// the channel id exists within item.path and I think its like the uuid name for a folder in git for a given dds
				ddsCommitChannelId = pathParts[3];
			} else {
				console.warn(
					"Unable to identify which dds data belongs to due to missing channel id:",
					item,
				);
			}
			if (!ddsSummaryMap.has(ddsCommitChannelId)) {
				ddsSummaryMap.set(ddsCommitChannelId, {
					content: undefined,
					attributes: undefined,
				});
			}

			// 2. Decode git commit blob contents
			const gitChannelData = await tenant.gitManager.getBlob(item.sha);
			const decodedCommitContents = atob(gitChannelData.content);

			// 3. Identify what type of information about the DDS this is
			if (item.path.endsWith("header")) {
				// This is the actual content in the DDS
				if (ddsCommitChannelId) {
					ddsSummaryMap.get(ddsCommitChannelId).content = decodedCommitContents;
				}
			} else if (item.path.endsWith(".attributes")) {
				// This is the metadata about the DDS
				if (ddsCommitChannelId) {
					ddsSummaryMap.get(ddsCommitChannelId).attributes = decodedCommitContents;
				}
			}
		}
	}

	const apiResponse: GetSummaryApiResponse = {
		gitCommit: commits[0],
		ddsSummaries: [],
	};

	for (const ddsSummary of ddsSummaryMap.values()) {
		apiResponse.ddsSummaries.push({
			attributes: ddsSummary.attributes,
			contents: ddsSummary.content,
		});
	}

	return apiResponse;
}
