/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import fs from "fs";
import { ICreateTreeParams, ITree, ITreeEntry } from "@fluidframework/gitresources";
import { Router } from "express";
import * as git from "isomorphic-git";
import nconf from "nconf";
import * as utils from "../utils";

export async function createTree(
	store: nconf.Provider,
	tenantId: string,
	authorization: string,
	params: ICreateTreeParams,
): Promise<ITree> {
	const entries: git.TreeEntry[] = params.tree.map((tree) => {
		const entry: git.TreeEntry = {
			mode: tree.mode,
			oid: tree.sha,
			path: tree.path,
			type: "tree",
		};

		return entry;
	});

	const sha = await git.writeTree({
		fs,
		dir: utils.getGitDir(store, tenantId),
		tree: entries,
	});

	return getTree(store, tenantId, authorization, sha, false, true);
}

export async function getTree(
	store: nconf.Provider,
	tenantId: string,
	authorization: string,
	sha: string,
	recursive: boolean,
	useCache: boolean,
): Promise<ITree> {
	let returnEntries;

	if (recursive) {
		returnEntries = await git.walk({
			fs,
			dir: utils.getGitDir(store, tenantId),
			map: (async (path, [head]) => {
				if (path === ".") {
					return;
				}

				return {
					path,
					mode: (await head.mode()).toString(8),
					sha: await head.oid(),
					size: 0,
					type: await head.type(),
					url: "",
				};
			}) as any,
			trees: [git.TREE({ ref: sha } as any)],
		});
	} else {
		const treeObject = await git.readTree({
			fs,
			dir: utils.getGitDir(store, tenantId),
			oid: sha,
		});
		const description = treeObject.tree;

		returnEntries = description.map((tree) => {
			const returnEntry: ITreeEntry = {
				path: tree.path,
				mode: tree.mode,
				sha: tree.oid,
				size: 0,
				type: tree.type,
				url: "",
			};

			return returnEntry;
		});
	}

	return {
		sha,
		tree: returnEntries,
		url: "",
	};
}

export function create(store: nconf.Provider): Router {
	const router: Router = Router();

	router.post("/repos/:ignored?/:tenantId/git/trees", (request, response) => {
		const treeP = createTree(
			store,
			request.params.tenantId,
			request.get("Authorization") ?? "",
			request.body,
		);

		utils.handleResponse(treeP, response, false, 201);
	});

	router.get("/repos/:ignored?/:tenantId/git/trees/:sha", (request, response) => {
		const useCache = !("disableCache" in request.query);
		const treeP = getTree(
			store,
			request.params.tenantId,
			request.get("Authorization") ?? "",
			request.params.sha,
			request.query.recursive === "1",
			useCache,
		);

		utils.handleResponse(treeP, response, useCache);
	});

	return router;
}
