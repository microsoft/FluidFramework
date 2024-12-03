/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as git from "@fluidframework/gitresources";
import { Router } from "express";
import nconf from "nconf";
import * as utils from "../utils";

export async function createTag(
	store: nconf.Provider,
	tenantId: string,
	authorization: string,
	params: git.ICreateTagParams,
): Promise<git.ITag> {
	throw new Error("Not implemented");
}

export async function getTag(
	store: nconf.Provider,
	tenantId: string,
	authorization: string,
	tag: string,
): Promise<git.ITag> {
	throw new Error("Not implemented");
}

export function create(store: nconf.Provider): Router {
	const router: Router = Router();

	router.post("/repos/:ignored?/:tenantId/git/tags", (request, response) => {
		const tagP = createTag(
			store,
			request.params.tenantId,
			request.get("Authorization") ?? "",
			request.body,
		);

		utils.handleResponse(tagP, response, false, 201);
	});

	router.get("/repos/:ignored?/:tenantId/git/tags/*", (request, response) => {
		const tagP = getTag(
			store,
			request.params.tenantId,
			request.get("Authorization") ?? "",
			request.params[0],
		);

		utils.handleResponse(tagP, response, false);
	});

	return router;
}
