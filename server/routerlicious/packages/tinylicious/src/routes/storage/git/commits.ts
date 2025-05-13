/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import fs from "fs";
import { ICommit, ICreateCommitParams } from "@fluidframework/gitresources";
import { Router } from "express";
import * as git from "isomorphic-git";
import nconf from "nconf";
import * as utils from "../utils";

export async function createCommit(
	store: nconf.Provider,
	tenantId: string,
	authorization: string,
	params: ICreateCommitParams,
): Promise<ICommit> {
	// TODO should include both author and committer
	const author = {
		email: params.author.email,
		name: params.author.name,
		timestamp: Math.floor(Date.parse(params.author.date) / 1000),
		timezoneOffset: 0,
	};

	const commitObject: git.CommitObject = {
		message: params.message,
		parent: params.parents,
		tree: params.tree,
		author,
		committer: author,
	};

	const sha = await git.writeCommit({
		fs,
		dir: utils.getGitDir(store, tenantId),
		commit: commitObject,
	});

	return {
		author: params.author,
		committer: params.author,
		message: params.message,
		parents: params.parents.map((parentSha) => ({
			sha: parentSha,
			url: "",
		})),
		sha,
		tree: { sha: params.tree, url: "" },
		url: "",
	};
}

export async function getCommit(
	store: nconf.Provider,
	tenantId: string,
	authorization: string,
	sha: string,
	useCache: boolean,
): Promise<ICommit> {
	const commit = await git.readCommit({
		fs,
		dir: utils.getGitDir(store, tenantId),
		oid: sha,
	});
	const description = commit.commit;

	return {
		author: {
			email: description.author.email,
			name: description.author.name,
			date: new Date(description.author.timestamp * 1000).toISOString(),
		},
		committer: {
			email: description.committer.email,
			name: description.committer.name,
			date: new Date(description.committer.timestamp * 1000).toISOString(),
		},
		message: description.message,
		parents: description.parent.map((parentSha) => ({
			sha: parentSha,
			url: "",
		})),
		sha,
		tree: { sha: description.tree, url: "" },
		url: "",
	};
}

export function create(store: nconf.Provider): Router {
	const router: Router = Router();

	router.post("/repos/:ignored?/:tenantId/git/commits", (request, response) => {
		const commitP = createCommit(
			store,
			request.params.tenantId,
			request.get("Authorization") ?? "",
			request.body,
		);

		utils.handleResponse(commitP, response, false, 201);
	});

	router.get("/repos/:ignored?/:tenantId/git/commits/:sha", (request, response) => {
		const useCache = !("disableCache" in request.query);
		const commitP = getCommit(
			store,
			request.params.tenantId,
			request.get("Authorization") ?? "",
			request.params.sha,
			useCache,
		);

		utils.handleResponse(commitP, response, useCache);
	});

	return router;
}
