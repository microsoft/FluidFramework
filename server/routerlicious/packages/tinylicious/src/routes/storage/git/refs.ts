/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import fs from "fs";
import { ICreateRefParams, IPatchRefParams, IRef } from "@fluidframework/gitresources";
import { Router } from "express";
import * as git from "isomorphic-git";
import nconf from "nconf";
import * as utils from "../utils";

function refToIRef(ref: string, sha: string): IRef {
	return {
		object: {
			sha,
			type: "",
			url: "",
		},
		ref,
		url: "",
	};
}

export async function getRefs(
	store: nconf.Provider,
	tenantId: string,
	authorization: string,
): Promise<IRef[]> {
	const branches = await git.listBranches({
		fs,
		dir: utils.getGitDir(store, tenantId),
	});

	return Promise.all(
		branches.map(async (branch) => getRef(store, tenantId, authorization, branch)),
	);
}

export async function getRef(
	store: nconf.Provider,
	tenantId: string,
	authorization: string,
	ref: string,
): Promise<IRef> {
	const resolved = await git.resolveRef({
		fs,
		dir: utils.getGitDir(store, tenantId),
		ref,
	});

	return refToIRef(ref, resolved);
}

export async function createRef(
	store: nconf.Provider,
	tenantId: string,
	authorization: string,
	params: ICreateRefParams,
): Promise<IRef> {
	await git.writeRef({
		fs,
		dir: utils.getGitDir(store, tenantId),
		ref: params.ref,
		value: params.sha,
	});

	return refToIRef(params.ref, params.sha);
}

export async function updateRef(
	store: nconf.Provider,
	tenantId: string,
	authorization: string,
	ref: string,
	params: IPatchRefParams,
): Promise<IRef> {
	const dir = utils.getGitDir(store, tenantId);

	// Current code - or nodegit - takes in updates without the /refs input - need to resolve the behavior and
	// either leave in the refs below or update the git managers to include it.
	const rebasedRef = `refs/${ref}`;

	// There is no updateRef in iso-git so we instead delete/write
	await git.writeRef({
		fs,
		dir,
		force: true,
		ref: rebasedRef,
		value: params.sha,
	});

	return refToIRef(ref, params.sha);
}

export async function deleteRef(
	store: nconf.Provider,
	tenantId: string,
	authorization: string,
	ref: string,
): Promise<void> {
	throw new Error("Not implemented");
}

export function create(store: nconf.Provider): Router {
	const router: Router = Router();

	router.get("/repos/:ignored?/:tenantId/git/refs", (request, response) => {
		const refsP = getRefs(store, request.params.tenantId, request.get("Authorization") ?? "");

		utils.handleResponse(refsP, response, false);
	});

	router.get("/repos/:ignored?/:tenantId/git/refs/*", (request, response) => {
		const refP = getRef(
			store,
			request.params.tenantId,
			request.get("Authorization") ?? "",
			request.params[0],
		);

		utils.handleResponse(refP, response, false);
	});

	router.post("/repos/:ignored?/:tenantId/git/refs", (request, response) => {
		const refP = createRef(
			store,
			request.params.tenantId,
			request.get("Authorization") ?? "",
			request.body,
		);

		utils.handleResponse(refP, response, false, 201);
	});

	router.patch("/repos/:ignored?/:tenantId/git/refs/*", (request, response) => {
		const refP = updateRef(
			store,
			request.params.tenantId,
			request.get("Authorization") ?? "",
			request.params[0],
			request.body,
		);

		utils.handleResponse(refP, response, false);
	});

	router.delete("/repos/:ignored?/:tenantId/git/refs/*", (request, response) => {
		const refP = deleteRef(
			store,
			request.params.tenantId,
			request.get("Authorization") ?? "",
			request.params[0],
		);

		utils.handleResponse(refP, response, false, 204);
	});

	return router;
}
