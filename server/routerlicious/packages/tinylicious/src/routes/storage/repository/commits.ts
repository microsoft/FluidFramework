/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import fs from "fs";
import { ICommitDetails } from "@fluidframework/gitresources";
import { Router } from "express";
import * as git from "isomorphic-git";
import nconf from "nconf";
import { queryParamToNumber, queryParamToString } from "../../../utils";
import * as utils from "../utils";

export async function getCommits(
	store: nconf.Provider,
	tenantId: string,
	authorization: string,
	sha: string,
	count: number,
): Promise<ICommitDetails[]> {
	const descriptions = await git.log({
		fs,
		depth: count,
		dir: utils.getGitDir(store, tenantId),
		ref: sha,
	});

	return descriptions.map((description) => {
		return {
			url: "",
			sha: description.oid,
			commit: {
				url: "",
				author: {
					name: description.commit.author.name,
					email: description.commit.author.email,
					date: new Date(description.commit.author.timestamp * 1000).toISOString(),
				},
				committer: {
					name: description.commit.committer.name,
					email: description.commit.committer.email,
					date: new Date(description.commit.committer.timestamp * 1000).toISOString(),
				},
				message: description.commit.message,
				tree: {
					sha: description.commit.tree,
					url: "",
				},
			},
			parents: description.commit.parent.map((parent) => ({
				sha: parent,
				url: "",
			})),
		};
	});
}

export function create(store: nconf.Provider): Router {
	const router: Router = Router();

	router.get("/repos/:ignored?/:tenantId/commits", (request, response) => {
		const commitsP = getCommits(
			store,
			request.params.tenantId,
			request.get("Authorization") ?? "",
			queryParamToString(request.query.sha) ?? "",
			queryParamToNumber(request.query.count) ?? 1,
		);

		utils.handleResponse(commitsP, response, false);
	});

	return router;
}
